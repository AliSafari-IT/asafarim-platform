import { and, eq } from "drizzle-orm";
import {
  checksumOf as schemaChecksumOf,
  validateSpecification,
  type ApplicationSpecificationType,
} from "@asafarim/appbuilder-schema";
import { REGISTRY_VERSION, renderPreview } from "@asafarim/appbuilder-runtime";
import type { Db } from "../db/client";
import { previewBuilds, specifications, specificationVersions } from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertCapability } from "./authz";
import { recordAuditEvent } from "./audit";
import { generateId } from "../db/ids";
import { NotFoundError } from "../errors";
import { routes } from "../routes";

export type PreviewBuildRow = typeof previewBuilds.$inferSelect;

export interface PreviewCreationResult {
  build: PreviewBuildRow;
  /** True when an identical (specificationVersionId, registryVersion) build already existed and was reused rather than re-created. */
  reused: boolean;
}

/**
 * The M06 preview creation/update service, built on the M05 `preview_builds`
 * persistence (lib/repositories/previewBuilds.ts). Validates the app's
 * *current* specification version, renders its homepage through the
 * approved registry to catch registry-level failures synchronously (no
 * background job system — see M06 issue's explicit "M07 prematurely" note),
 * and creates or reuses an idempotent build pinned to
 * (specificationVersionId, registryVersion).
 *
 * On success: advances `specifications.pinnedPreviewBuildId` — the ONLY
 * code path that pointer ever moves through.
 * On failure: inserts a "failed" build with structured diagnostics and
 * leaves the existing pinned pointer (if any) completely untouched, so the
 * last successful preview keeps serving at `/apps/{appId}/preview`.
 */
export async function requestPreviewBuild(db: Db, actor: Actor, appId: string): Promise<PreviewCreationResult> {
  // Same minimum capability as the M05 previewBuilds.ts#createPreviewBuild —
  // requesting a (re)build is an editing action, blocked on an archived app.
  await assertCapability(db, actor, appId, "app.editSpecification");

  const [specification] = await db.select().from(specifications).where(eq(specifications.appId, appId)).limit(1);
  if (!specification) {
    throw new NotFoundError("Specification", appId);
  }

  const [version] = await db
    .select()
    .from(specificationVersions)
    .where(
      and(
        eq(specificationVersions.specificationId, specification.id),
        eq(specificationVersions.versionNumber, specification.currentVersionNumber),
      ),
    )
    .limit(1);
  if (!version) {
    throw new NotFoundError("Specification version", `${specification.id}@${specification.currentVersionNumber}`);
  }

  const [existing] = await db
    .select()
    .from(previewBuilds)
    .where(and(eq(previewBuilds.specificationVersionId, version.id), eq(previewBuilds.registryVersion, REGISTRY_VERSION)))
    .limit(1);

  if (existing) {
    if (existing.status === "succeeded" && specification.pinnedPreviewBuildId !== existing.id) {
      await db
        .update(specifications)
        .set({ pinnedPreviewBuildId: existing.id, updatedAt: new Date() })
        .where(eq(specifications.id, specification.id));
    }
    return { build: existing, reused: true };
  }

  const payload = version.payload as ApplicationSpecificationType;
  const computedChecksum = schemaChecksumOf(payload);
  const diagnostics: Record<string, unknown>[] = [];
  let status: "succeeded" | "failed" = "succeeded";

  if (computedChecksum !== version.checksum) {
    // Defense-in-depth: an immutable version row whose stored checksum no
    // longer matches its own payload indicates corruption, not a normal
    // validation failure — never render it.
    status = "failed";
    diagnostics.push({
      code: "checksum_mismatch",
      message: "The stored specification version's checksum no longer matches its payload.",
    });
  } else {
    const validation = validateSpecification(payload);
    if (!validation.ok) {
      status = "failed";
      diagnostics.push(...validation.errors.map((issue) => ({ code: issue.code, message: issue.message, path: issue.path })));
    } else {
      const rendered = renderPreview({ specification: payload, path: [], basePath: routes.appPreview(appId) });
      if (!rendered.ok) {
        status = "failed";
        diagnostics.push(...rendered.errors.map((error) => ({ code: error.code, message: error.message, path: error.path })));
      }
      // rendered.warnings (recoverable per-component diagnostics already
      // shown inline in the render) do not fail the build — the preview is
      // still genuinely usable with those components flagged.
    }
  }

  return db.transaction(async (tx) => {
    const now = new Date();
    const [build] = await tx
      .insert(previewBuilds)
      .values({
        id: generateId(),
        appId,
        specificationVersionId: version.id,
        checksum: computedChecksum,
        registryVersion: REGISTRY_VERSION,
        status,
        requestedByPrincipalId: actor.principalId,
        startedAt: now,
        completedAt: now,
        errorMessage: status === "failed" ? diagnostics.map((entry) => String(entry.message)).join("; ").slice(0, 2000) : null,
        diagnostics: diagnostics.length > 0 ? diagnostics : null,
      })
      .returning();

    if (status === "succeeded") {
      await tx
        .update(specifications)
        .set({ pinnedPreviewBuildId: build.id, updatedAt: now })
        .where(eq(specifications.id, specification.id));
    }

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: status === "succeeded" ? "preview.build.succeeded" : "preview.build.failed",
      targetType: "preview_build",
      targetId: build.id,
      metadata: { specificationVersionId: version.id, registryVersion: REGISTRY_VERSION, status },
    });

    return { build, reused: false };
  });
}

export interface PinnedPreview {
  build: PreviewBuildRow;
  specificationPayload: ApplicationSpecificationType;
  /** The version number the pinned build was rendered from — what the M08 preview-selection protocol stamps into a selection so a stale (superseded) selection can be detected and rejected. */
  specificationVersionNumber: number;
}

/**
 * Resolves the app's pinned, successful preview — the ONLY thing the
 * `/apps/{appId}/preview` route is ever allowed to render. Never accepts or
 * consults a version id from the caller; the browser has no way to request
 * a different version through this function.
 */
export async function getPinnedPreview(db: Db, actor: Actor, appId: string): Promise<PinnedPreview | null> {
  await assertCapability(db, actor, appId, "app.viewPreview");

  const [specification] = await db.select().from(specifications).where(eq(specifications.appId, appId)).limit(1);
  if (!specification?.pinnedPreviewBuildId) return null;

  const [build] = await db
    .select()
    .from(previewBuilds)
    .where(and(eq(previewBuilds.id, specification.pinnedPreviewBuildId), eq(previewBuilds.appId, appId)))
    .limit(1);
  if (!build || build.status !== "succeeded") return null;

  const [version] = await db
    .select()
    .from(specificationVersions)
    .where(and(eq(specificationVersions.id, build.specificationVersionId), eq(specificationVersions.appId, appId)))
    .limit(1);
  if (!version) return null;

  return {
    build,
    specificationPayload: version.payload as ApplicationSpecificationType,
    specificationVersionNumber: version.versionNumber,
  };
}
