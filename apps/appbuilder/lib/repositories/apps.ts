import { eq, inArray, or } from "drizzle-orm";
import type { Db } from "../db/client";
import { apps, collaborators, idempotencyKeys, specifications } from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertAppAccess, type AppRow } from "./authz";
import { recordAuditEvent } from "./audit";
import { generateId } from "../db/ids";
import { checksumOf } from "../db/hash";
import { ConflictError } from "../errors";

const UNIQUE_VIOLATION = "23505";

export interface CreateAppInput {
  name: string;
  slug: string;
}

/**
 * Creates an app and its initial (empty, draft) specification in one
 * transaction. Idempotent on `idempotencyKey`: a retried request with the
 * same key and payload replays the original result instead of creating a
 * second app; the same key reused with a different payload is rejected.
 */
export async function createApp(
  db: Db,
  actor: Actor,
  input: CreateAppInput,
  idempotencyKey: string,
): Promise<AppRow> {
  const requestHash = checksumOf(input);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, idempotencyKey))
      .limit(1);

    if (existing && existing.ownerPrincipalId === actor.principalId && existing.scope === "create-app") {
      if (existing.requestHash !== requestHash) {
        throw new ConflictError("Idempotency key reused with a different request payload");
      }
      if (existing.status === "in_progress") {
        throw new ConflictError("A create-app request with this idempotency key is already in progress");
      }
      if (existing.status === "completed" && existing.responseSnapshot) {
        const appId = (existing.responseSnapshot as { appId: string }).appId;
        const [app] = await tx.select().from(apps).where(eq(apps.id, appId)).limit(1);
        if (app) return app;
      }
    }

    const idempotencyRowId = existing?.id ?? generateId();
    if (!existing) {
      await tx.insert(idempotencyKeys).values({
        id: idempotencyRowId,
        ownerPrincipalId: actor.principalId,
        scope: "create-app",
        key: idempotencyKey,
        requestHash,
        status: "in_progress",
      });
    }

    const appId = generateId();
    let app: AppRow;
    try {
      [app] = await tx
        .insert(apps)
        .values({ id: appId, ownerPrincipalId: actor.principalId, name: input.name, slug: input.slug })
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError(`An app with slug "${input.slug}" already exists`);
      }
      throw err;
    }

    await tx.insert(specifications).values({
      id: generateId(),
      appId,
      status: "draft",
      currentVersionNumber: 0,
    });

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "app.created",
      targetType: "app",
      targetId: appId,
    });

    await tx
      .update(idempotencyKeys)
      .set({ status: "completed", responseSnapshot: { appId }, updatedAt: new Date() })
      .where(eq(idempotencyKeys.id, idempotencyRowId));

    return app;
  });
}

/** Scoped read — never call `apps.id` lookups without going through actor access. */
export async function getAppForActor(db: Db, actor: Actor, appId: string): Promise<AppRow> {
  return assertAppAccess(db, actor, appId, "viewer");
}

/**
 * Every app the actor owns or actively collaborates on. There is
 * intentionally no unscoped "list all apps" helper.
 */
export async function listAppsForActor(db: Db, actor: Actor): Promise<AppRow[]> {
  const collaboratorAppIds = await db
    .select({ appId: collaborators.appId })
    .from(collaborators)
    .where(eq(collaborators.principalId, actor.principalId));

  const ids = collaboratorAppIds.map((row) => row.appId);

  return db
    .select()
    .from(apps)
    .where(
      ids.length > 0
        ? or(eq(apps.ownerPrincipalId, actor.principalId), inArray(apps.id, ids))
        : eq(apps.ownerPrincipalId, actor.principalId),
    );
}

export async function archiveApp(db: Db, actor: Actor, appId: string): Promise<AppRow> {
  await assertAppAccess(db, actor, appId, "owner");

  return db.transaction(async (tx) => {
    const now = new Date();
    const [app] = await tx
      .update(apps)
      .set({ status: "archived", archivedAt: now, updatedAt: now })
      .where(eq(apps.id, appId))
      .returning();

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "app.archived",
      targetType: "app",
      targetId: appId,
    });

    return app;
  });
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === UNIQUE_VIOLATION;
}
