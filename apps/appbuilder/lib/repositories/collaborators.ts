import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { collaborators } from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertAppAccess, type Role } from "./authz";
import { recordAuditEvent } from "./audit";
import { generateId } from "../db/ids";
import { ConflictError, NotFoundError } from "../errors";

export type CollaboratorRow = typeof collaborators.$inferSelect;

export async function addCollaborator(
  db: Db,
  actor: Actor,
  appId: string,
  principalId: string,
  role: Role,
): Promise<CollaboratorRow> {
  await assertAppAccess(db, actor, appId, "owner");

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(collaborators)
      .where(and(eq(collaborators.appId, appId), eq(collaborators.principalId, principalId)))
      .limit(1);

    if (existing) {
      if (existing.status === "active") {
        throw new ConflictError(`${principalId} is already a collaborator on this app`);
      }
      const [reactivated] = await tx
        .update(collaborators)
        .set({ status: "active", role, revokedAt: null, updatedAt: new Date() })
        .where(eq(collaborators.id, existing.id))
        .returning();
      return reactivated;
    }

    const [collaborator] = await tx
      .insert(collaborators)
      .values({
        id: generateId(),
        appId,
        principalId,
        role,
        invitedByPrincipalId: actor.principalId,
      })
      .returning();

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "collaborator.added",
      targetType: "collaborator",
      targetId: collaborator.id,
      metadata: { principalId, role },
    });

    return collaborator;
  });
}

export async function listCollaborators(db: Db, actor: Actor, appId: string): Promise<CollaboratorRow[]> {
  await assertAppAccess(db, actor, appId, "viewer");
  return db.select().from(collaborators).where(eq(collaborators.appId, appId));
}

export async function revokeCollaborator(
  db: Db,
  actor: Actor,
  appId: string,
  collaboratorId: string,
): Promise<CollaboratorRow> {
  await assertAppAccess(db, actor, appId, "owner");

  return db.transaction(async (tx) => {
    const now = new Date();
    const [collaborator] = await tx
      .update(collaborators)
      .set({ status: "revoked", revokedAt: now, updatedAt: now })
      // Both id AND appId in the predicate: a collaborator id leaked from
      // another app can never be revoked through this app's scope.
      .where(and(eq(collaborators.id, collaboratorId), eq(collaborators.appId, appId)))
      .returning();

    if (!collaborator) {
      throw new NotFoundError("Collaborator", collaboratorId);
    }

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "collaborator.revoked",
      targetType: "collaborator",
      targetId: collaboratorId,
    });

    return collaborator;
  });
}
