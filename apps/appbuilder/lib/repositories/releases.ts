import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { releases } from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertAppAccess } from "./authz";
import { recordAuditEvent } from "./audit";
import { generateId } from "../db/ids";
import { ConflictError, NotFoundError } from "../errors";

export type ReleaseRow = typeof releases.$inferSelect;

const UNIQUE_VIOLATION = "23505";

export async function createRelease(
  db: Db,
  actor: Actor,
  appId: string,
  input: { specificationVersionId: string; versionLabel: string },
): Promise<ReleaseRow> {
  await assertAppAccess(db, actor, appId, "owner");

  try {
    const [release] = await db
      .insert(releases)
      .values({
        id: generateId(),
        appId,
        specificationVersionId: input.specificationVersionId,
        versionLabel: input.versionLabel,
        status: "draft",
      })
      .returning();
    return release;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError(`Release "${input.versionLabel}" already exists for this app`);
    }
    throw err;
  }
}

export async function publishRelease(db: Db, actor: Actor, appId: string, releaseId: string): Promise<ReleaseRow> {
  await assertAppAccess(db, actor, appId, "owner");

  return db.transaction(async (tx) => {
    const now = new Date();
    const [release] = await tx
      .update(releases)
      .set({ status: "published", publishedByPrincipalId: actor.principalId, publishedAt: now })
      .where(and(eq(releases.id, releaseId), eq(releases.appId, appId)))
      .returning();

    if (!release) {
      throw new NotFoundError("Release", releaseId);
    }

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "release.published",
      targetType: "release",
      targetId: releaseId,
    });

    return release;
  });
}

export async function listReleasesForActor(db: Db, actor: Actor, appId: string): Promise<ReleaseRow[]> {
  await assertAppAccess(db, actor, appId, "viewer");
  return db.select().from(releases).where(eq(releases.appId, appId));
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === UNIQUE_VIOLATION;
}
