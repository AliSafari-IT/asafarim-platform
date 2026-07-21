import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { previewBuilds } from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertAppAccess } from "./authz";
import { generateId } from "../db/ids";
import { NotFoundError } from "../errors";

export type PreviewBuildRow = typeof previewBuilds.$inferSelect;

export async function createPreviewBuild(
  db: Db,
  actor: Actor,
  appId: string,
  specificationVersionId: string,
): Promise<PreviewBuildRow> {
  await assertAppAccess(db, actor, appId, "editor");

  const [build] = await db
    .insert(previewBuilds)
    .values({
      id: generateId(),
      appId,
      specificationVersionId,
      status: "queued",
      requestedByPrincipalId: actor.principalId,
    })
    .returning();

  return build;
}

export async function listPreviewBuildsForActor(
  db: Db,
  actor: Actor,
  appId: string,
): Promise<PreviewBuildRow[]> {
  await assertAppAccess(db, actor, appId, "viewer");
  return db.select().from(previewBuilds).where(eq(previewBuilds.appId, appId));
}

export async function updatePreviewBuildStatus(
  db: Db,
  actor: Actor,
  appId: string,
  buildId: string,
  update: {
    status: PreviewBuildRow["status"];
    startedAt?: Date;
    completedAt?: Date;
    errorMessage?: string;
  },
): Promise<PreviewBuildRow> {
  await assertAppAccess(db, actor, appId, "editor");

  const [build] = await db
    .update(previewBuilds)
    .set(update)
    // Both id AND appId: a build id from another app can never be updated
    // through this app's scope.
    .where(and(eq(previewBuilds.id, buildId), eq(previewBuilds.appId, appId)))
    .returning();

  if (!build) {
    throw new NotFoundError("Preview build", buildId);
  }
  return build;
}
