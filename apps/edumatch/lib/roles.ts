/**
 * Role names EduMatch treats as admin-equivalent for its OWN /admin area.
 * "edumatch_admin" is scoped to this app only (packages/seed-manager's
 * foundation role definition grants it zero platform RBAC permissions);
 * "admin"/"superadmin" are the platform-wide roles, which EduMatch also
 * honors so a general admin never loses access here.
 *
 * Pure and dependency-free on purpose so both server code (lib/server/
 * profiles.ts) and client components (EduNav, AdminShell) can import it
 * without pulling server-only modules (Prisma, etc.) into the client bundle.
 */
export const EDU_ADMIN_ROLE_NAMES = ["admin", "superadmin", "edumatch_admin"] as const;

export function isEduAdminRole(roles: readonly string[]): boolean {
  return roles.some((role) => (EDU_ADMIN_ROLE_NAMES as readonly string[]).includes(role));
}
