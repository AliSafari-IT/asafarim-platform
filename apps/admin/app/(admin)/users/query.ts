import { ROLES } from "@asafarim/auth";

/**
 * The user directory's filter contract, shared by the page and the CSV
 * export route so an export always matches exactly what the operator is
 * looking at.
 */

export const PAGE_SIZE = 20;

export type StatusFilter = "all" | "active" | "inactive";

export interface UserFilters {
  q: string;
  status: StatusFilter;
  role: string;
  page: number;
}

export function parseUserFilters(
  params: Record<string, string | undefined>
): UserFilters {
  const status = params.status;
  return {
    q: (params.q ?? "").trim(),
    status: status === "active" || status === "inactive" ? status : "all",
    role: (params.role ?? "").trim(),
    page: Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1),
  };
}

export function buildUserWhere(filters: UserFilters) {
  return {
    ...(filters.status === "all" ? {} : { isActive: filters.status === "active" }),
    ...(filters.role
      ? { userRoles: { some: { role: { name: filters.role } } } }
      : {}),
    ...(filters.q
      ? {
          OR: [
            { name: { contains: filters.q, mode: "insensitive" as const } },
            { email: { contains: filters.q, mode: "insensitive" as const } },
            { username: { contains: filters.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

export function userQueryString(
  filters: UserFilters,
  overrides: Partial<UserFilters> = {}
): string {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.status !== "all") params.set("status", merged.status);
  if (merged.role) params.set("role", merged.role);
  if (merged.page > 1) params.set("page", String(merged.page));
  return params.toString();
}

export function userHref(
  filters: UserFilters,
  overrides: Partial<UserFilters> = {}
): string {
  const qs = userQueryString(filters, overrides);
  return qs ? `/users?${qs}` : "/users";
}

export function hasUserFilters(filters: UserFilters): boolean {
  return Boolean(filters.q || filters.status !== "all" || filters.role);
}

export const ADMIN_ROLE_NAMES: string[] = [ROLES.ADMIN, ROLES.SUPERADMIN];
