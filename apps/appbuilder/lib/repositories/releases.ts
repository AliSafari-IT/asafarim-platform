import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { appDomains, apps, releases } from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertCapability } from "./authz";
import { recordAuditEvent } from "./audit";
import { generateId } from "../db/ids";
import { ConflictError, NotFoundError } from "../errors";
import { checkReleaseEligibility } from "../deployment/eligibility";
import { buildReleaseManifest, computeManifestChecksum } from "../deployment/manifest";
import { ReleaseNotEligibleError, StaleApprovalError } from "../deployment/errors";
import { managedAppsBaseDomain } from "../routing/resolveAppHost";

export type ReleaseRow = typeof releases.$inferSelect;

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === UNIQUE_VIOLATION;
}

async function currentActiveReleaseId(db: Db, appId: string): Promise<string | null> {
  const [domain] = await db
    .select({ activeReleaseId: appDomains.activeReleaseId })
    .from(appDomains)
    .where(and(eq(appDomains.appId, appId), eq(appDomains.status, "active")))
    .limit(1);
  return domain?.activeReleaseId ?? null;
}

export interface PrepareReleaseInput {
  specificationVersionId: string;
}

/**
 * M11 release preparation. Idempotent on `releases_app_spec_version_unique`
 * (lib/db/schema.ts): preparing the SAME specification version twice returns
 * the already-frozen draft rather than erroring or re-freezing it — but
 * preparing a version that has already progressed past `draft` (approved,
 * published, superseded, archived) is refused, since the manifest is
 * immutable once frozen and this endpoint is only ever "prepare a NEW draft".
 *
 * Every fact frozen into the manifest is re-derived from persisted rows by
 * `checkReleaseEligibility`/`buildReleaseManifest` — nothing here is ever
 * accepted from the browser beyond WHICH already-persisted specification
 * version to consider.
 */
export async function prepareRelease(db: Db, actor: Actor, appId: string, input: PrepareReleaseInput): Promise<ReleaseRow> {
  await assertCapability(db, actor, appId, "app.deployRelease");

  const [existing] = await db
    .select()
    .from(releases)
    .where(and(eq(releases.appId, appId), eq(releases.specificationVersionId, input.specificationVersionId)))
    .limit(1);
  if (existing) {
    if (existing.status === "draft") return existing;
    throw new ConflictError(`This specification version already has a release in status "${existing.status}" — prepare a newer version instead.`);
  }

  const eligibility = await checkReleaseEligibility(db, appId, input.specificationVersionId);
  if (!eligibility.eligible || !eligibility.evidence) {
    throw new ReleaseNotEligibleError(eligibility.reasons);
  }

  const [app] = await db.select().from(apps).where(eq(apps.id, appId)).limit(1);
  if (!app) throw new NotFoundError("App", appId);

  const releaseId = generateId();
  const previousReleaseId = await currentActiveReleaseId(db, appId);
  const productionHost = `${app.slug}.${managedAppsBaseDomain()}`;
  const preparedAt = new Date();

  const manifest = buildReleaseManifest({
    releaseId,
    appId,
    appSlug: app.slug,
    productionHost,
    evidence: eligibility.evidence,
    previousReleaseId,
    initiatingActorPrincipalId: actor.principalId,
    preparedAt,
  });
  const manifestChecksum = computeManifestChecksum(manifest);

  try {
    return await db.transaction(async (tx) => {
      const [release] = await tx
        .insert(releases)
        .values({
          id: releaseId,
          appId,
          specificationVersionId: eligibility.evidence!.specificationVersion.id,
          specificationVersionNumber: eligibility.evidence!.specificationVersion.versionNumber,
          specificationChecksum: eligibility.evidence!.specificationVersion.checksum,
          schemaVersion: eligibility.evidence!.specificationVersion.schemaVersion,
          previewBuildId: eligibility.evidence!.previewBuild?.id ?? null,
          previewChecksum: eligibility.evidence!.previewBuild?.checksum ?? null,
          registryVersion: manifest.registryVersion,
          validationRunId: eligibility.evidence!.validationRun?.id ?? null,
          gateSetVersion: eligibility.evidence!.validationRun?.gateSetVersion ?? null,
          dataCompatibility: eligibility.evidence!.dataCompatibility.verdict,
          dataCompatibilityDetail: eligibility.evidence!.dataCompatibility as unknown as Record<string, unknown>,
          manifest: manifest as unknown as Record<string, unknown>,
          manifestChecksum,
          appSlug: app.slug,
          productionHost,
          versionLabel: `v${eligibility.evidence!.specificationVersion.versionNumber}`,
          status: "draft",
          preparedByPrincipalId: actor.principalId,
          previousReleaseId,
          createdAt: preparedAt,
        })
        .returning();

      await recordAuditEvent(tx, {
        appId,
        actorPrincipalId: actor.principalId,
        action: "release.prepared",
        targetType: "release",
        targetId: release.id,
        metadata: { specificationVersionId: input.specificationVersionId, versionLabel: release.versionLabel },
      });

      return release;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Lost a race with a concurrent prepare for the same version — replay
      // the winner's row rather than surfacing a spurious conflict.
      const [raced] = await db
        .select()
        .from(releases)
        .where(and(eq(releases.appId, appId), eq(releases.specificationVersionId, input.specificationVersionId)))
        .limit(1);
      if (raced) return raced;
    }
    throw err;
  }
}

/**
 * Binds approval to the EXACT frozen version/checksum by re-running
 * eligibility fresh (never trusting the manifest snapshot from preparation
 * time) — if a fact eligibility depends on has changed since preparation
 * (the backing validation run was superseded, the preview build was
 * invalidated, the app was archived), approval is refused with
 * `StaleApprovalError` rather than rubber-stamping a now-stale draft.
 */
export async function approveRelease(db: Db, actor: Actor, appId: string, releaseId: string): Promise<ReleaseRow> {
  await assertCapability(db, actor, appId, "app.approve");

  const [release] = await db.select().from(releases).where(and(eq(releases.id, releaseId), eq(releases.appId, appId))).limit(1);
  if (!release) throw new NotFoundError("Release", releaseId);
  if (release.status !== "draft") {
    if (release.status === "approved" || release.status === "published") return release;
    throw new ConflictError(`Release is in status "${release.status}" and can no longer be approved.`);
  }

  const eligibility = await checkReleaseEligibility(db, appId, release.specificationVersionId);
  if (!eligibility.eligible) {
    throw new StaleApprovalError(eligibility.reasons);
  }

  return db.transaction(async (tx) => {
    const now = new Date();
    const [updated] = await tx
      .update(releases)
      .set({ status: "approved", approvedByPrincipalId: actor.principalId, approvedAt: now })
      .where(and(eq(releases.id, releaseId), eq(releases.appId, appId), eq(releases.status, "draft")))
      .returning();
    if (!updated) throw new ConflictError("Release was concurrently modified — reload and try again.");

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "release.approved",
      targetType: "release",
      targetId: releaseId,
    });

    return updated;
  });
}

export async function getReleaseForActor(db: Db, actor: Actor, appId: string, releaseId: string): Promise<ReleaseRow> {
  await assertCapability(db, actor, appId, "app.view");
  const [release] = await db.select().from(releases).where(and(eq(releases.id, releaseId), eq(releases.appId, appId))).limit(1);
  if (!release) throw new NotFoundError("Release", releaseId);
  return release;
}

export async function listReleasesForActor(db: Db, actor: Actor, appId: string): Promise<ReleaseRow[]> {
  await assertCapability(db, actor, appId, "app.view");
  return db.select().from(releases).where(eq(releases.appId, appId)).orderBy(desc(releases.createdAt));
}

/** Internal helper for other repositories (deployments.ts) that need a release row scoped to an app without re-checking `app.view` (the caller has already asserted its own, more specific capability). */
export async function getReleaseForApp(db: Db, appId: string, releaseId: string): Promise<ReleaseRow | null> {
  const [release] = await db.select().from(releases).where(and(eq(releases.id, releaseId), eq(releases.appId, appId))).limit(1);
  return release ?? null;
}

