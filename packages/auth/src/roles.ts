import type { Session } from "next-auth";

/** System role names seeded by packages/db (prisma/seed.ts). */
export const ROLES = {
  SUPERADMIN: "superadmin",
  ADMIN: "admin",
  STANDARD_USER: "standard_user",
  GUEST: "guest",
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

/**
 * Check whether the session user has at least one of the given roles.
 * Superadmin always passes.
 */
export function hasRole(
  session: Session | null,
  role: string | string[]
): boolean {
  const userRoles = session?.user?.roles ?? [];
  if (userRoles.includes(ROLES.SUPERADMIN)) return true;

  const wanted = Array.isArray(role) ? role : [role];
  return userRoles.some((r) => wanted.includes(r));
}

export function isAdmin(session: Session | null): boolean {
  return hasRole(session, ROLES.ADMIN);
}
