"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@asafarim/db";
import {
  ROLES,
  getSession,
  hasRole,
  hasPermission,
  slugifyUsername,
} from "@asafarim/auth";
import type { Session } from "next-auth";
import { writeAuditEvent } from "../../../lib/audit";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Every mutation re-checks the session and the specific permission on the
 * server — the admin layout's role gate and any UI hiding are not trusted.
 */
async function requireActor(
  permission: string
): Promise<{ session: Session } | { error: string }> {
  const session = await getSession();
  if (!session?.user?.id || session.user.isActive === false) {
    return { error: "Not signed in." };
  }
  if (!hasRole(session, [ROLES.ADMIN])) {
    return { error: "Admin access required." };
  }
  if (!(await hasPermission(session, permission))) {
    return { error: `Missing permission: ${permission}.` };
  }
  return { session };
}

/** Number of active users holding the superadmin role. */
async function countActiveSuperadmins(): Promise<number> {
  return prisma.user.count({
    where: {
      isActive: true,
      userRoles: { some: { role: { name: ROLES.SUPERADMIN } } },
    },
  });
}

function refreshUserPaths(userId: string) {
  revalidatePath("/users");
  revalidatePath(`/users/${userId}`);
}

// ─── Activation / deactivation ─────────────────────────────────

export async function setUserActiveState(input: {
  userId: string;
  active: boolean;
  /** Required when an admin deactivates their own account. */
  confirmSelf?: boolean;
}): Promise<ActionResult> {
  const actor = await requireActor("users.deactivate");
  if ("error" in actor) return { ok: false, error: actor.error };
  const actorId = actor.session.user.id;

  try {
    const target = await prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        email: true,
        isActive: true,
        userRoles: { select: { role: { select: { name: true } } } },
      },
    });
    if (!target) return { ok: false, error: "User not found." };
    if (target.isActive === input.active) return { ok: true };

    if (!input.active) {
      if (target.id === actorId && !input.confirmSelf) {
        return {
          ok: false,
          error:
            "You are deactivating your own account — confirm explicitly to proceed.",
        };
      }
      const targetIsSuperadmin = target.userRoles.some(
        (ur) => ur.role.name === ROLES.SUPERADMIN
      );
      if (targetIsSuperadmin && (await countActiveSuperadmins()) <= 1) {
        return {
          ok: false,
          error: "This is the last active superadmin — it cannot be deactivated.",
        };
      }
    }

    await prisma.user.update({
      where: { id: target.id },
      data: {
        isActive: input.active,
        deactivatedAt: input.active ? null : new Date(),
      },
    });

    await writeAuditEvent({
      userId: actorId,
      action: input.active ? "user.activated" : "user.deactivated",
      entity: "User",
      entityId: target.id,
      changes: { email: target.email, isActive: { from: target.isActive, to: input.active } },
    });

    refreshUserPaths(target.id);
    return { ok: true };
  } catch (error) {
    console.error("[admin] setUserActiveState failed:", error);
    return { ok: false, error: "The change could not be saved. Try again." };
  }
}

// ─── Role assignment ───────────────────────────────────────────

export async function assignRoleToUser(input: {
  userId: string;
  roleId: string;
}): Promise<ActionResult> {
  const actor = await requireActor("roles.assign");
  if ("error" in actor) return { ok: false, error: actor.error };
  const actorId = actor.session.user.id;

  try {
    const [target, role] = await Promise.all([
      prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true, email: true },
      }),
      prisma.role.findUnique({
        where: { id: input.roleId },
        select: { id: true, name: true },
      }),
    ]);
    if (!target) return { ok: false, error: "User not found." };
    if (!role) return { ok: false, error: "Role not found." };

    // Granting superadmin hands out unrestricted access — only an existing
    // superadmin may do that.
    if (
      role.name === ROLES.SUPERADMIN &&
      !actor.session.user.roles.includes(ROLES.SUPERADMIN)
    ) {
      return { ok: false, error: "Only a superadmin can grant superadmin." };
    }

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: target.id, roleId: role.id } },
      update: {},
      create: { userId: target.id, roleId: role.id, assignedBy: actorId },
    });

    await writeAuditEvent({
      userId: actorId,
      action: "role.assigned",
      entity: "UserRole",
      entityId: target.id,
      changes: { email: target.email, role: role.name },
    });

    refreshUserPaths(target.id);
    return { ok: true };
  } catch (error) {
    console.error("[admin] assignRoleToUser failed:", error);
    return { ok: false, error: "The role could not be assigned. Try again." };
  }
}

export async function removeRoleFromUser(input: {
  userId: string;
  roleId: string;
  /** Required when an admin removes their own final admin/superadmin access. */
  confirmSelf?: boolean;
}): Promise<ActionResult> {
  const actor = await requireActor("roles.assign");
  if ("error" in actor) return { ok: false, error: actor.error };
  const actorId = actor.session.user.id;

  try {
    const assignment = await prisma.userRole.findUnique({
      where: {
        userId_roleId: { userId: input.userId, roleId: input.roleId },
      },
      select: {
        userId: true,
        roleId: true,
        role: { select: { name: true } },
        user: {
          select: {
            email: true,
            isActive: true,
            userRoles: { select: { role: { select: { name: true } } } },
          },
        },
      },
    });
    if (!assignment) {
      return { ok: false, error: "This user does not hold that role." };
    }
    const roleName = assignment.role.name;

    if (
      roleName === ROLES.SUPERADMIN &&
      !actor.session.user.roles.includes(ROLES.SUPERADMIN)
    ) {
      return { ok: false, error: "Only a superadmin can revoke superadmin." };
    }

    // The platform must always keep one active superadmin.
    if (
      roleName === ROLES.SUPERADMIN &&
      assignment.user.isActive &&
      (await countActiveSuperadmins()) <= 1
    ) {
      return {
        ok: false,
        error: "This is the last active superadmin — the role cannot be removed.",
      };
    }

    // Removing your own final admin/superadmin role locks you out of this
    // console; demand a hard confirmation from the UI.
    if (assignment.userId === actorId && !input.confirmSelf) {
      const adminRoles: string[] = [ROLES.ADMIN, ROLES.SUPERADMIN];
      const remaining = assignment.user.userRoles
        .map((ur) => ur.role.name)
        .filter((name) => name !== roleName);
      const losesAdminAccess =
        adminRoles.includes(roleName) &&
        !remaining.some((name) => adminRoles.includes(name));
      if (losesAdminAccess) {
        return {
          ok: false,
          error:
            "Removing this role revokes your own admin access — confirm explicitly to proceed.",
        };
      }
    }

    await prisma.userRole.delete({
      where: {
        userId_roleId: { userId: input.userId, roleId: input.roleId },
      },
    });

    await writeAuditEvent({
      userId: actorId,
      action: "role.removed",
      entity: "UserRole",
      entityId: input.userId,
      changes: { email: assignment.user.email, role: roleName },
    });

    refreshUserPaths(input.userId);
    return { ok: true };
  } catch (error) {
    console.error("[admin] removeRoleFromUser failed:", error);
    return { ok: false, error: "The role could not be removed. Try again." };
  }
}

// ─── Identity edits ────────────────────────────────────────────

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export async function updateUserIdentity(input: {
  userId: string;
  name: string;
  username: string;
  email: string;
}): Promise<ActionResult> {
  const actor = await requireActor("users.edit");
  if ("error" in actor) return { ok: false, error: actor.error };
  const actorId = actor.session.user.id;

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const username = slugifyUsername(input.username);

  if (name.length > 120) {
    return { ok: false, error: "Name must be 120 characters or fewer." };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (username.length < 3 || username.length > 24) {
    return { ok: false, error: "Username must be 3–24 characters." };
  }

  try {
    const target = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, name: true, username: true, email: true },
    });
    if (!target) return { ok: false, error: "User not found." };

    const [emailTaken, usernameTaken] = await Promise.all([
      prisma.user.findFirst({
        where: { email, NOT: { id: target.id } },
        select: { id: true },
      }),
      prisma.user.findFirst({
        where: { username, NOT: { id: target.id } },
        select: { id: true },
      }),
    ]);
    if (emailTaken) return { ok: false, error: "This email is already in use." };
    if (usernameTaken) {
      return { ok: false, error: "This username is already taken." };
    }

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if ((target.name ?? "") !== name) {
      changes.name = { from: target.name, to: name || null };
    }
    if ((target.username ?? "") !== username) {
      changes.username = { from: target.username, to: username };
    }
    if (target.email !== email) {
      changes.email = { from: target.email, to: email };
    }
    if (Object.keys(changes).length === 0) return { ok: true };

    await prisma.user.update({
      where: { id: target.id },
      data: { name: name || null, username, email },
    });

    await writeAuditEvent({
      userId: actorId,
      action: "user.updated",
      entity: "User",
      entityId: target.id,
      changes,
    });

    refreshUserPaths(target.id);
    return { ok: true };
  } catch (error) {
    console.error("[admin] updateUserIdentity failed:", error);
    return { ok: false, error: "The change could not be saved. Try again." };
  }
}
