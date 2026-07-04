import { prisma } from "@asafarim/db";
import type { Session } from "next-auth";
import { ROLES } from "./roles";

/**
 * Check whether the session user has a permission (via any of their roles).
 * Superadmin always passes without a database query.
 */
export async function hasPermission(
  session: Session | null,
  permission: string
): Promise<boolean> {
  if (!session?.user?.id) return false;
  if (session.user.roles?.includes(ROLES.SUPERADMIN)) return true;

  const count = await prisma.rolePermission.count({
    where: {
      permission: { name: permission },
      role: { userRoles: { some: { userId: session.user.id } } },
    },
  });

  return count > 0;
}

/** All permission names granted to a user through their roles. */
export async function getUserPermissions(userId: string): Promise<string[]> {
  const rolePermissions = await prisma.rolePermission.findMany({
    where: { role: { userRoles: { some: { userId } } } },
    select: { permission: { select: { name: true } } },
    distinct: ["permissionId"],
  });

  return rolePermissions.map((rp) => rp.permission.name);
}
