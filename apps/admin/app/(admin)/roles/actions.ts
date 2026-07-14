"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@asafarim/db";
import { ROLES, getSession, hasRole, hasPermission } from "@asafarim/auth";
import type { Session } from "next-auth";
import { writeAuditEvent } from "../../../lib/audit";

export type ActionResult =
  | { ok: true; roleId?: string }
  | { ok: false; error: string };

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

const ROLE_NAME_PATTERN = /^[a-z][a-z0-9_]{2,39}$/;

function normalizeRoleName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function refreshRolePaths(roleId?: string) {
  revalidatePath("/roles");
  if (roleId) revalidatePath(`/roles/${roleId}`);
  revalidatePath("/permissions");
}

// ─── Create ────────────────────────────────────────────────────

export async function createRole(input: {
  name: string;
  displayName: string;
  description: string;
}): Promise<ActionResult> {
  const actor = await requireActor("roles.edit");
  if ("error" in actor) return { ok: false, error: actor.error };

  const name = normalizeRoleName(input.name);
  const displayName = input.displayName.trim();
  const description = input.description.trim();

  if (!ROLE_NAME_PATTERN.test(name)) {
    return {
      ok: false,
      error:
        "Role name must be 3–40 chars: lowercase letters, digits, underscores, starting with a letter.",
    };
  }
  if (displayName.length < 2 || displayName.length > 80) {
    return { ok: false, error: "Display name must be 2–80 characters." };
  }
  if (description.length > 500) {
    return { ok: false, error: "Description must be 500 characters or fewer." };
  }

  try {
    const existing = await prisma.role.findUnique({
      where: { name },
      select: { id: true },
    });
    if (existing) return { ok: false, error: "A role with this name exists." };

    const role = await prisma.role.create({
      data: { name, displayName, description: description || null },
    });

    await writeAuditEvent({
      userId: actor.session.user.id,
      action: "role.created",
      entity: "Role",
      entityId: role.id,
      changes: { name, displayName, description: description || null },
    });

    refreshRolePaths(role.id);
    return { ok: true, roleId: role.id };
  } catch (error) {
    console.error("[admin] createRole failed:", error);
    return { ok: false, error: "The role could not be created. Try again." };
  }
}

// ─── Metadata edit ─────────────────────────────────────────────

export async function updateRoleMeta(input: {
  roleId: string;
  displayName: string;
  description: string;
}): Promise<ActionResult> {
  const actor = await requireActor("roles.edit");
  if ("error" in actor) return { ok: false, error: actor.error };

  const displayName = input.displayName.trim();
  const description = input.description.trim();
  if (displayName.length < 2 || displayName.length > 80) {
    return { ok: false, error: "Display name must be 2–80 characters." };
  }
  if (description.length > 500) {
    return { ok: false, error: "Description must be 500 characters or fewer." };
  }

  try {
    const role = await prisma.role.findUnique({
      where: { id: input.roleId },
      select: { id: true, name: true, displayName: true, description: true },
    });
    if (!role) return { ok: false, error: "Role not found." };

    // System role *names* are code-referenced constants and immutable; the
    // human-facing metadata (displayName/description) may still be edited.
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (role.displayName !== displayName) {
      changes.displayName = { from: role.displayName, to: displayName };
    }
    if ((role.description ?? "") !== description) {
      changes.description = { from: role.description, to: description || null };
    }
    if (Object.keys(changes).length === 0) return { ok: true };

    await prisma.role.update({
      where: { id: role.id },
      data: { displayName, description: description || null },
    });

    await writeAuditEvent({
      userId: actor.session.user.id,
      action: "role.updated",
      entity: "Role",
      entityId: role.id,
      changes: { role: role.name, ...changes },
    });

    refreshRolePaths(role.id);
    return { ok: true };
  } catch (error) {
    console.error("[admin] updateRoleMeta failed:", error);
    return { ok: false, error: "The role could not be updated. Try again." };
  }
}

// ─── Permission grants ─────────────────────────────────────────

export async function setRolePermissions(input: {
  roleId: string;
  permissionIds: string[];
}): Promise<ActionResult> {
  const actor = await requireActor("roles.edit");
  if ("error" in actor) return { ok: false, error: actor.error };

  try {
    const role = await prisma.role.findUnique({
      where: { id: input.roleId },
      select: {
        id: true,
        name: true,
        rolePermissions: {
          select: { permissionId: true, permission: { select: { name: true } } },
        },
      },
    });
    if (!role) return { ok: false, error: "Role not found." };

    // Superadmin bypasses permission checks entirely; editing its grants
    // would only create a false impression of restriction.
    if (role.name === ROLES.SUPERADMIN) {
      return {
        ok: false,
        error:
          "Superadmin bypasses permission checks — its grants are fixed by the seed.",
      };
    }

    const requested = new Set(input.permissionIds);
    const current = new Set(role.rolePermissions.map((rp) => rp.permissionId));

    const toAdd = [...requested].filter((id) => !current.has(id));
    const toRemove = [...current].filter((id) => !requested.has(id));
    if (toAdd.length === 0 && toRemove.length === 0) return { ok: true };

    // Validate requested ids against the catalog before writing.
    const validCount = await prisma.permission.count({
      where: { id: { in: [...requested] } },
    });
    if (validCount !== requested.size) {
      return { ok: false, error: "Unknown permission in selection." };
    }

    const permissionNames = new Map(
      (
        await prisma.permission.findMany({
          where: { id: { in: [...toAdd, ...toRemove] } },
          select: { id: true, name: true },
        })
      ).map((p) => [p.id, p.name])
    );

    await prisma.$transaction([
      ...(toRemove.length > 0
        ? [
            prisma.rolePermission.deleteMany({
              where: { roleId: role.id, permissionId: { in: toRemove } },
            }),
          ]
        : []),
      ...(toAdd.length > 0
        ? [
            prisma.rolePermission.createMany({
              data: toAdd.map((permissionId) => ({
                roleId: role.id,
                permissionId,
              })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);

    await writeAuditEvent({
      userId: actor.session.user.id,
      action: "role.permissions.updated",
      entity: "Role",
      entityId: role.id,
      changes: {
        role: role.name,
        granted: toAdd.map((id) => permissionNames.get(id) ?? id),
        revoked: toRemove.map((id) => permissionNames.get(id) ?? id),
      },
    });

    refreshRolePaths(role.id);
    return { ok: true };
  } catch (error) {
    console.error("[admin] setRolePermissions failed:", error);
    return { ok: false, error: "The grants could not be saved. Try again." };
  }
}

// ─── Delete ────────────────────────────────────────────────────

export async function deleteRole(input: {
  roleId: string;
}): Promise<ActionResult> {
  const actor = await requireActor("roles.edit");
  if ("error" in actor) return { ok: false, error: actor.error };

  try {
    const role = await prisma.role.findUnique({
      where: { id: input.roleId },
      select: {
        id: true,
        name: true,
        isSystem: true,
        _count: { select: { userRoles: true } },
      },
    });
    if (!role) return { ok: false, error: "Role not found." };
    if (role.isSystem) {
      return { ok: false, error: "System roles cannot be deleted." };
    }

    await prisma.role.delete({ where: { id: role.id } });

    await writeAuditEvent({
      userId: actor.session.user.id,
      action: "role.deleted",
      entity: "Role",
      entityId: role.id,
      changes: { role: role.name, usersAffected: role._count.userRoles },
    });

    refreshRolePaths();
    return { ok: true };
  } catch (error) {
    console.error("[admin] deleteRole failed:", error);
    return { ok: false, error: "The role could not be deleted. Try again." };
  }
}
