import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { apps, collaborators } from "../db/schema";
import type { Actor } from "../auth/actor";
import { ForbiddenError, NotFoundError } from "../errors";

export type Role = "viewer" | "editor" | "owner";

const ROLE_RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };

export type AppRow = typeof apps.$inferSelect;

/**
 * The single chokepoint for app-scoped access. Every repository method that
 * touches an app-owned table must call this first — there is deliberately
 * no lower-level "get app by id" helper that skips it, so a caller cannot
 * accidentally read/write another owner's data.
 *
 * Throws NotFoundError if the app doesn't exist, ForbiddenError if the
 * actor is neither the owner nor an active collaborator meeting
 * `minRole`. Returns the app row on success so callers avoid a second query.
 */
export async function assertAppAccess(
  db: Db,
  actor: Actor,
  appId: string,
  minRole: Role = "viewer",
): Promise<AppRow> {
  const [app] = await db.select().from(apps).where(eq(apps.id, appId)).limit(1);
  if (!app) {
    throw new NotFoundError("App", appId);
  }

  if (app.ownerPrincipalId === actor.principalId) {
    return app;
  }

  const [collaborator] = await db
    .select()
    .from(collaborators)
    .where(
      and(
        eq(collaborators.appId, appId),
        eq(collaborators.principalId, actor.principalId),
        eq(collaborators.status, "active"),
      ),
    )
    .limit(1);

  if (!collaborator || ROLE_RANK[collaborator.role] < ROLE_RANK[minRole]) {
    throw new ForbiddenError();
  }

  return app;
}
