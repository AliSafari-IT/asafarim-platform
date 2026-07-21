import { desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { creationRequests, previewBuilds, releases, specifications } from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertCapability, type AppRow, type Role } from "./authz";
import type { StarterFamily } from "../validation/createApp";

export type SpecificationRow = typeof specifications.$inferSelect;
export type PreviewBuildRow = typeof previewBuilds.$inferSelect;
export type ReleaseRow = typeof releases.$inferSelect;
export type CreationRequestRow = typeof creationRequests.$inferSelect;

export interface AppOverview {
  app: AppRow;
  role: Role;
  specification: SpecificationRow | null;
  /** Most recently requested preview build, if any have been requested. */
  latestPreviewBuild: PreviewBuildRow | null;
  /** Most recently created release, if any exist. */
  latestRelease: ReleaseRow | null;
  /** The M05 creation intent (prompt + starter family) — may be absent for apps predating M05. */
  creationRequest: CreationRequestRow | null;
}

/**
 * Everything the M05 continuation/overview page (`/apps/[appId]`) needs,
 * in one actor-scoped read. Never returns the specification's JSON
 * payload — only container-level metadata (status, current version
 * number) — matching the "no internal specification JSON in
 * list/overview responses" rule; the full payload is reserved for the
 * dedicated version-read paths (specifications.ts).
 */
export async function getAppOverviewForActor(db: Db, actor: Actor, appId: string): Promise<AppOverview> {
  const { app, role } = await assertCapability(db, actor, appId, "app.view");

  const [[specification], [latestPreviewBuild], [latestRelease], [creationRequest]] = await Promise.all([
    db.select().from(specifications).where(eq(specifications.appId, appId)).limit(1),
    db
      .select()
      .from(previewBuilds)
      .where(eq(previewBuilds.appId, appId))
      .orderBy(desc(previewBuilds.createdAt))
      .limit(1),
    db
      .select()
      .from(releases)
      .where(eq(releases.appId, appId))
      .orderBy(desc(releases.createdAt))
      .limit(1),
    db.select().from(creationRequests).where(eq(creationRequests.appId, appId)).limit(1),
  ]);

  return {
    app,
    role,
    specification: specification ?? null,
    latestPreviewBuild: latestPreviewBuild ?? null,
    latestRelease: latestRelease ?? null,
    creationRequest: creationRequest ?? null,
  };
}

export function starterFamilyOf(row: CreationRequestRow | null): StarterFamily | null {
  return row ? (row.starterFamily as StarterFamily) : null;
}

export interface CatalogCardMetadata {
  currentVersionNumber: number;
  specificationStatus: SpecificationRow["status"] | null;
  previewStatus: PreviewBuildRow["status"] | null;
  releaseStatus: ReleaseRow["status"] | null;
  starterFamily: StarterFamily | null;
}

/**
 * Batched (not N+1) per-app display metadata for a page of already
 * actor-scoped app ids — safe to call with ids returned from
 * `listCatalogForActor` without re-checking capability, since membership in
 * that id set already proved access. Callers must never pass ids from an
 * untrusted source into this function.
 */
export async function listCatalogMetadata(
  db: Db,
  appIds: string[],
): Promise<Map<string, CatalogCardMetadata>> {
  const result = new Map<string, CatalogCardMetadata>();
  if (appIds.length === 0) return result;

  const [specRows, latestPreviews, latestReleases, creationRows] = await Promise.all([
    db
      .select({ appId: specifications.appId, currentVersionNumber: specifications.currentVersionNumber, status: specifications.status })
      .from(specifications)
      .where(inArray(specifications.appId, appIds)),
    db
      .select({ appId: previewBuilds.appId, status: previewBuilds.status })
      .from(previewBuilds)
      .where(inArray(previewBuilds.appId, appIds))
      .orderBy(previewBuilds.appId, desc(previewBuilds.createdAt))
      .then((rows) => dedupeByAppId(rows)),
    db
      .select({ appId: releases.appId, status: releases.status })
      .from(releases)
      .where(inArray(releases.appId, appIds))
      .orderBy(releases.appId, desc(releases.createdAt))
      .then((rows) => dedupeByAppId(rows)),
    db
      .select({ appId: creationRequests.appId, starterFamily: creationRequests.starterFamily })
      .from(creationRequests)
      .where(inArray(creationRequests.appId, appIds)),
  ]);

  const previewByAppId = new Map(latestPreviews.map((row) => [row.appId, row.status]));
  const releaseByAppId = new Map(latestReleases.map((row) => [row.appId, row.status]));
  const starterByAppId = new Map(creationRows.map((row) => [row.appId, row.starterFamily as StarterFamily]));

  for (const appId of appIds) {
    const spec = specRows.find((row) => row.appId === appId);
    result.set(appId, {
      currentVersionNumber: spec?.currentVersionNumber ?? 0,
      specificationStatus: spec?.status ?? null,
      previewStatus: previewByAppId.get(appId) ?? null,
      releaseStatus: releaseByAppId.get(appId) ?? null,
      starterFamily: starterByAppId.get(appId) ?? null,
    });
  }

  return result;
}

/** Keeps only the first (most recent, given the caller's ORDER BY) row per appId. */
function dedupeByAppId<T extends { appId: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (seen.has(row.appId)) continue;
    seen.add(row.appId);
    out.push(row);
  }
  return out;
}
