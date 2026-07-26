import { and, asc, eq, ne } from "drizzle-orm";
import type { Db } from "../db/client";
import { generatedAppMembers } from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertCapability } from "../repositories/authz";
import { recordAuditEvent } from "../repositories/audit";
import { generateId } from "../db/ids";
import { ConflictError, NotFoundError } from "../errors";
import type { ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import { loadPinnedSpec } from "./runtimeAuth";
import type { GeneratedEnvironment } from "./environment";

/**
 * M09's generated-app membership model — deliberately a SEPARATE identity
 * system from M03's owner/editor/viewer AppBuilder roles.
 *
 * M03 roles (`collaborators.role`, `apps.ownerPrincipalId`) govern access to
 * the AppBuilder *development workspace* — who may edit the specification,
 * request AI changes, restore versions, etc. (see lib/repositories/authz.ts).
 *
 * M09 roles (`generatedAppMembers.roleIds`) govern use of the FINISHED,
 * generated application — e.g. "admin"/"manager"/"employee" in the
 * task-management fixture. These role ids are defined inside the pinned
 * specification's `roles` array (@asafarim/appbuilder-schema's `Role`), not
 * by AppBuilder itself, and are validated to exist there on every write.
 *
 * An AppBuilder editor is NEVER automatically a generated-app administrator
 * — the only bridge between the two systems is `bootstrapOwnerAsAdmin`,
 * which is itself a builder-side action (gated by the BUILDER capability
 * `app.manageGeneratedMembers`, owner-rank) that creates an explicit,
 * auditable membership row for the app's owner. Every other membership
 * mutation is equally builder-gated and equally explicit — there is no
 * silent/implicit membership anywhere in this module.
 */

export type GeneratedAppMemberRow = typeof generatedAppMembers.$inferSelect;

export class UnknownRoleIdError extends ConflictError {
  constructor(roleId: string) {
    super(`Role "${roleId}" does not exist in the app's pinned specification.`);
    this.name = "UnknownRoleIdError";
  }
}

export class FinalAdminProtectionError extends ConflictError {
  constructor() {
    super("This app must always have at least one active generated-app administrator; this change would remove the last one.");
    this.name = "FinalAdminProtectionError";
  }
}

function assertRoleIdsExist(spec: ApplicationSpecificationType, roleIds: string[]): void {
  const known = new Set(spec.roles.filter((r) => !r.archived).map((r) => r.id));
  for (const roleId of roleIds) {
    if (!known.has(roleId)) throw new UnknownRoleIdError(roleId);
  }
}

/**
 * The role id used at this app's very first ("owner_bootstrap"-provenance)
 * membership row — derived from existing data rather than a dedicated
 * column. Used only to decide what "the final administrator" means for
 * `FinalAdminProtectionError` — see this module's docstring.
 */
async function getAdminRoleId(db: Db, appId: string, environment: GeneratedEnvironment): Promise<string | null> {
  const [row] = await db
    .select()
    .from(generatedAppMembers)
    .where(
      and(
        eq(generatedAppMembers.appId, appId),
        eq(generatedAppMembers.environment, environment),
        eq(generatedAppMembers.provenance, "owner_bootstrap"),
      ),
    )
    .orderBy(asc(generatedAppMembers.createdAt))
    .limit(1);
  return row?.roleIds[0] ?? null;
}

/** Final-admin protection is a PER-ENVIRONMENT invariant: revoking the last production admin must not be allowed just because a preview admin still exists. */
async function countActiveAdmins(
  db: Db,
  appId: string,
  environment: GeneratedEnvironment,
  adminRoleId: string,
  excludeMemberId?: string,
): Promise<number> {
  const rows = await db
    .select()
    .from(generatedAppMembers)
    .where(
      and(
        eq(generatedAppMembers.appId, appId),
        eq(generatedAppMembers.environment, environment),
        eq(generatedAppMembers.status, "active"),
      ),
    );
  return rows.filter((row) => row.id !== excludeMemberId && row.roleIds.includes(adminRoleId)).length;
}

/**
 * Bootstraps the app's OWNER (never merely an owner-rank actor — this
 * always targets `apps.ownerPrincipalId` specifically, so a platform
 * superadmin acting via the M03 bypass never accidentally becomes a
 * generated-app administrator) as the first generated-app member, holding
 * `adminRoleId`. Idempotent: retrying when a bootstrap row already exists
 * for this app returns it unchanged rather than erroring or duplicating.
 */
export async function bootstrapOwnerAsAdmin(
  db: Db,
  actor: Actor,
  appId: string,
  adminRoleId: string,
  environment: GeneratedEnvironment = "preview",
): Promise<GeneratedAppMemberRow> {
  const { app } = await assertCapability(db, actor, appId, "app.manageGeneratedMembers");
  const { spec } = await loadPinnedSpec(db, appId);
  assertRoleIdsExist(spec, [adminRoleId]);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(generatedAppMembers)
      .where(
        and(
          eq(generatedAppMembers.appId, appId),
          eq(generatedAppMembers.environment, environment),
          eq(generatedAppMembers.principalId, app.ownerPrincipalId),
        ),
      )
      .limit(1);
    if (existing) return existing;

    const [member] = await tx
      .insert(generatedAppMembers)
      .values({
        id: generateId(),
        appId,
        environment,
        principalId: app.ownerPrincipalId,
        roleIds: [adminRoleId],
        status: "active",
        provenance: "owner_bootstrap",
        invitedByPrincipalId: null,
      })
      .returning();

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "generated_membership.bootstrapped",
      targetType: "generated_app_member",
      targetId: member.id,
      metadata: { principalId: app.ownerPrincipalId, roleIds: [adminRoleId], environment },
    });

    return member;
  });
}

export interface AddMemberInput {
  principalId: string;
  roleIds: string[];
}

/**
 * Adds (or reactivates a previously revoked) generated-app member.
 * `principalId` must be a real, trusted platform SSO id supplied by the
 * BUILDER performing this action (e.g. resolved server-side from a
 * directory lookup) — it is never accepted as an authoritative claim from
 * an untrusted end-user client.
 */
export async function addMember(
  db: Db,
  actor: Actor,
  appId: string,
  input: AddMemberInput,
  environment: GeneratedEnvironment = "preview",
): Promise<GeneratedAppMemberRow> {
  await assertCapability(db, actor, appId, "app.manageGeneratedMembers");
  if (input.roleIds.length === 0) throw new ConflictError("At least one role id is required.");
  const { spec } = await loadPinnedSpec(db, appId);
  assertRoleIdsExist(spec, input.roleIds);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(generatedAppMembers)
      .where(
        and(
          eq(generatedAppMembers.appId, appId),
          eq(generatedAppMembers.environment, environment),
          eq(generatedAppMembers.principalId, input.principalId),
        ),
      )
      .limit(1);

    if (existing) {
      if (existing.status === "active") {
        throw new ConflictError("This principal is already an active generated-app member.");
      }
      const [reactivated] = await tx
        .update(generatedAppMembers)
        .set({ status: "active", roleIds: input.roleIds, invitedByPrincipalId: actor.principalId, updatedAt: new Date() })
        .where(eq(generatedAppMembers.id, existing.id))
        .returning();
      await recordAuditEvent(tx, {
        appId,
        actorPrincipalId: actor.principalId,
        action: "generated_membership.reactivated",
        targetType: "generated_app_member",
        targetId: existing.id,
        metadata: { principalId: input.principalId, roleIds: input.roleIds, environment },
      });
      return reactivated;
    }

    const [member] = await tx
      .insert(generatedAppMembers)
      .values({
        id: generateId(),
        appId,
        environment,
        principalId: input.principalId,
        roleIds: input.roleIds,
        status: "active",
        provenance: "invited",
        invitedByPrincipalId: actor.principalId,
      })
      .returning();

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "generated_membership.added",
      targetType: "generated_app_member",
      targetId: member.id,
      metadata: { principalId: input.principalId, roleIds: input.roleIds, environment },
    });

    return member;
  });
}

export async function changeMemberRoles(db: Db, actor: Actor, appId: string, memberId: string, roleIds: string[]): Promise<GeneratedAppMemberRow> {
  await assertCapability(db, actor, appId, "app.manageGeneratedMembers");
  if (roleIds.length === 0) throw new ConflictError("At least one role id is required.");
  const { spec } = await loadPinnedSpec(db, appId);
  assertRoleIdsExist(spec, roleIds);

  return db.transaction(async (tx) => {
    const [member] = await tx
      .select()
      .from(generatedAppMembers)
      .where(and(eq(generatedAppMembers.id, memberId), eq(generatedAppMembers.appId, appId)))
      .for("update")
      .limit(1);
    if (!member) throw new NotFoundError("Generated-app member", memberId);

    // Final-admin protection is evaluated within the MEMBER'S OWN
    // environment (read off the row, never from a caller argument) so
    // demoting the last production admin is never permitted merely because
    // a preview admin still exists.
    const adminRoleId = await getAdminRoleId(db, appId, member.environment);
    if (adminRoleId && member.roleIds.includes(adminRoleId) && !roleIds.includes(adminRoleId)) {
      const remaining = await countActiveAdmins(tx, appId, member.environment, adminRoleId, memberId);
      if (remaining === 0) throw new FinalAdminProtectionError();
    }

    const [updated] = await tx
      .update(generatedAppMembers)
      .set({ roleIds, updatedAt: new Date() })
      .where(eq(generatedAppMembers.id, memberId))
      .returning();

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "generated_membership.roles_changed",
      targetType: "generated_app_member",
      targetId: memberId,
      metadata: { previousRoleIds: member.roleIds, roleIds },
    });

    return updated;
  });
}

export async function revokeMember(db: Db, actor: Actor, appId: string, memberId: string): Promise<GeneratedAppMemberRow> {
  await assertCapability(db, actor, appId, "app.manageGeneratedMembers");

  return db.transaction(async (tx) => {
    const [member] = await tx
      .select()
      .from(generatedAppMembers)
      .where(and(eq(generatedAppMembers.id, memberId), eq(generatedAppMembers.appId, appId)))
      .for("update")
      .limit(1);
    if (!member) throw new NotFoundError("Generated-app member", memberId);
    if (member.status === "revoked") return member;

    const adminRoleId = await getAdminRoleId(db, appId, member.environment);
    if (adminRoleId && member.roleIds.includes(adminRoleId)) {
      const remaining = await countActiveAdmins(tx, appId, member.environment, adminRoleId, memberId);
      if (remaining === 0) throw new FinalAdminProtectionError();
    }

    const [revoked] = await tx
      .update(generatedAppMembers)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(eq(generatedAppMembers.id, memberId))
      .returning();

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "generated_membership.revoked",
      targetType: "generated_app_member",
      targetId: memberId,
      metadata: { principalId: member.principalId },
    });

    return revoked;
  });
}

/**
 * The caller's own generated-app membership row FOR THE GIVEN ENVIRONMENT,
 * or null if they are not (or no longer) a member there. Never requires
 * builder capability — any authenticated platform user may ask "am I a
 * member of this app". Membership in preview grants nothing in production
 * and vice versa: they are separate rows with separate roles.
 */
export async function getOwnMembership(
  db: Db,
  actor: Actor,
  appId: string,
  environment: GeneratedEnvironment = "preview",
): Promise<GeneratedAppMemberRow | null> {
  const [row] = await db
    .select()
    .from(generatedAppMembers)
    .where(
      and(
        eq(generatedAppMembers.appId, appId),
        eq(generatedAppMembers.environment, environment),
        eq(generatedAppMembers.principalId, actor.principalId),
        eq(generatedAppMembers.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Full membership list for the builder's "manage generated-app members" panel, scoped to one environment. */
export async function listMembers(
  db: Db,
  actor: Actor,
  appId: string,
  environment: GeneratedEnvironment = "preview",
): Promise<GeneratedAppMemberRow[]> {
  await assertCapability(db, actor, appId, "app.manageGeneratedMembers");
  return db
    .select()
    .from(generatedAppMembers)
    .where(
      and(
        eq(generatedAppMembers.appId, appId),
        eq(generatedAppMembers.environment, environment),
        ne(generatedAppMembers.status, "revoked"),
      ),
    )
    .orderBy(asc(generatedAppMembers.createdAt));
}
