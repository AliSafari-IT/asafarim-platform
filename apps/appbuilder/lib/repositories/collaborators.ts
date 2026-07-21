import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { collaborators } from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertCapability, type Role } from "./authz";
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
  const { app } = await assertCapability(db, actor, appId, "app.manageCollaborators");
  assertNotOwner(app.ownerPrincipalId, principalId);

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

      await recordAuditEvent(tx, {
        appId,
        actorPrincipalId: actor.principalId,
        action: "collaborator.added",
        targetType: "collaborator",
        targetId: reactivated.id,
        metadata: { principalId, role },
      });

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
  await assertCapability(db, actor, appId, "app.view");
  return db.select().from(collaborators).where(eq(collaborators.appId, appId));
}

export async function changeCollaboratorRole(
  db: Db,
  actor: Actor,
  appId: string,
  collaboratorId: string,
  role: Role,
): Promise<CollaboratorRow> {
  const { app } = await assertCapability(db, actor, appId, "app.manageCollaborators");

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(collaborators)
      .where(and(eq(collaborators.id, collaboratorId), eq(collaborators.appId, appId)))
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Collaborator", collaboratorId);
    }
    assertNotOwner(app.ownerPrincipalId, existing.principalId);

    const [collaborator] = await tx
      .update(collaborators)
      .set({ role, updatedAt: new Date() })
      .where(and(eq(collaborators.id, collaboratorId), eq(collaborators.appId, appId)))
      .returning();

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "collaborator.role_changed",
      targetType: "collaborator",
      targetId: collaboratorId,
      metadata: { principalId: existing.principalId, from: existing.role, to: role },
    });

    return collaborator;
  });
}

export async function revokeCollaborator(
  db: Db,
  actor: Actor,
  appId: string,
  collaboratorId: string,
): Promise<CollaboratorRow> {
  const { app } = await assertCapability(db, actor, appId, "app.manageCollaborators");

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(collaborators)
      // Both id AND appId in the predicate: a collaborator id leaked from
      // another app can never be reached through this app's scope.
      .where(and(eq(collaborators.id, collaboratorId), eq(collaborators.appId, appId)))
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Collaborator", collaboratorId);
    }
    assertNotOwner(app.ownerPrincipalId, existing.principalId);

    const now = new Date();
    const [collaborator] = await tx
      .update(collaborators)
      .set({ status: "revoked", revokedAt: now, updatedAt: now })
      .where(and(eq(collaborators.id, collaboratorId), eq(collaborators.appId, appId)))
      .returning();

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "collaborator.removed",
      targetType: "collaborator",
      targetId: collaboratorId,
      metadata: { principalId: existing.principalId },
    });

    return collaborator;
  });
}

/**
 * The app's owner (`apps.ownerPrincipalId`) is never itself a row in the
 * collaborators table — protects the final owner from being accidentally
 * added with a lesser role, demoted, or removed via the collaborator APIs.
 * Ownership transfer is not implemented in M03.
 */
function assertNotOwner(ownerPrincipalId: string, principalId: string): void {
  if (principalId === ownerPrincipalId) {
    throw new ConflictError("The app owner cannot be managed as a collaborator");
  }
}
