import { and, desc, eq } from "drizzle-orm";
import type { ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import { REGISTRY_VERSION } from "@asafarim/appbuilder-runtime";
import type { Db } from "../db/client";
import { appDomains, apps, previewBuilds, releases, specificationVersions, validationRuns } from "../db/schema";
import { computeDataCompatibility, type DataCompatibilityResult } from "./dataCompatibility";

export interface EligibilityEvidence {
  specificationVersion: typeof specificationVersions.$inferSelect;
  validationRun: typeof validationRuns.$inferSelect | null;
  previewBuild: typeof previewBuilds.$inferSelect | null;
  dataCompatibility: DataCompatibilityResult;
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
  evidence: EligibilityEvidence | null;
}

/**
 * Re-derives release eligibility from persisted records ONLY — never trusts
 * a cached flag on a `releases` row, and never accepts anything from the
 * caller beyond the app id and the EXACT specification version being
 * considered. Called at three points, deliberately re-run fresh every time
 * rather than reused: `prepareRelease`, `approveRelease` (to catch staleness
 * between prepare and approve), and `createDeployment` (the issue's
 * "recheck eligibility transactionally immediately before deployment").
 *
 * A version is eligible only when EVERY one of the issue's conditions holds:
 * - the exact version+checksum has a completed, PASSED, release-eligible M10
 *   validation run (never recomputed from gate rows here — that computation
 *   already happened once, authoritatively, in validationRuns.finalizeRun);
 * - the pinned preview build for that exact version+registry succeeded and
 *   its checksum matches the version's own checksum;
 * - schema evolution relative to the currently-live production release (if
 *   any) is not "unsafe";
 * - the app is not archived.
 *
 * Capability/actor authorization is intentionally NOT checked here — that is
 * `assertCapability`'s job, applied by the caller before or alongside this.
 */
export async function checkReleaseEligibility(db: Db, appId: string, specificationVersionId: string): Promise<EligibilityResult> {
  const reasons: string[] = [];

  const [version] = await db
    .select()
    .from(specificationVersions)
    .where(and(eq(specificationVersions.id, specificationVersionId), eq(specificationVersions.appId, appId)))
    .limit(1);
  if (!version) {
    return { eligible: false, reasons: ["Specification version was not found for this app."], evidence: null };
  }

  const [app] = await db.select().from(apps).where(eq(apps.id, appId)).limit(1);
  if (!app) {
    return { eligible: false, reasons: ["App was not found."], evidence: null };
  }
  if (app.status === "archived") {
    reasons.push("App is archived.");
  }

  const [validationRun] = await db
    .select()
    .from(validationRuns)
    .where(
      and(
        eq(validationRuns.appId, appId),
        eq(validationRuns.specificationVersionId, specificationVersionId),
        eq(validationRuns.specificationChecksum, version.checksum),
        eq(validationRuns.status, "passed"),
        eq(validationRuns.releaseEligible, true),
      ),
    )
    .orderBy(desc(validationRuns.createdAt))
    .limit(1);
  if (!validationRun) {
    reasons.push("No completed, passing, release-eligible validation run exists for this exact specification version and checksum.");
  }

  const [previewBuild] = await db
    .select()
    .from(previewBuilds)
    .where(and(eq(previewBuilds.specificationVersionId, specificationVersionId), eq(previewBuilds.registryVersion, REGISTRY_VERSION)))
    .orderBy(desc(previewBuilds.createdAt))
    .limit(1);
  if (!previewBuild || previewBuild.status !== "succeeded") {
    reasons.push("Preview build for this exact version has not succeeded.");
  } else if (previewBuild.checksum !== version.checksum) {
    reasons.push("Preview build checksum does not match this specification version's checksum.");
  }

  const [activeDomain] = await db
    .select()
    .from(appDomains)
    .where(and(eq(appDomains.appId, appId), eq(appDomains.status, "active")))
    .limit(1);
  let currentProductionSpec: ApplicationSpecificationType | null = null;
  if (activeDomain?.activeReleaseId) {
    const [productionRelease] = await db.select().from(releases).where(eq(releases.id, activeDomain.activeReleaseId)).limit(1);
    if (productionRelease) {
      const [productionVersion] = await db
        .select()
        .from(specificationVersions)
        .where(eq(specificationVersions.id, productionRelease.specificationVersionId))
        .limit(1);
      currentProductionSpec = (productionVersion?.payload as unknown as ApplicationSpecificationType) ?? null;
    }
  }

  const dataCompatibility = await computeDataCompatibility(db, appId, version.payload as unknown as ApplicationSpecificationType, currentProductionSpec);
  if (dataCompatibility.verdict === "unsafe") {
    reasons.push("Schema evolution relative to the current production release is unsafe (requires an explicit reviewed migration, or a tightened constraint is violated by live production data).");
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    evidence: { specificationVersion: version, validationRun: validationRun ?? null, previewBuild: previewBuild ?? null, dataCompatibility },
  };
}
