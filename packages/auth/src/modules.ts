import { prisma } from "@asafarim/db";
import { PLATFORM_APPS } from "./apps";
import { ROLES, type RoleName } from "./roles";

/**
 * Navigation visibility: which console sections and which platform apps each
 * role SEES in menus.
 *
 * This is presentation, not authorization. Every route keeps its own
 * server-side gate — requireRole, hasPermission, and the app-access decision
 * in apps.ts — and none of them consult this module. Hiding an entry here is
 * a courtesy that reduces clutter for a role; it never grants access, and
 * revealing an entry never bypasses a check. Treating it as a security
 * control is the one way to misuse it.
 */

export type NavModuleGroup = "console" | "apps";

export interface NavModule {
  /** Stable id used as the override key. Never reuse an id for a new thing. */
  id: string;
  label: string;
  description: string;
  group: NavModuleGroup;
  /** Roles that see this entry when no override is stored. */
  defaultRoles: readonly RoleName[];
  /** Console route, for entries that map to one. */
  href?: string;
}

/** Admin console sections, mirroring the (admin) route group. */
const CONSOLE_MODULES: readonly NavModule[] = [
  {
    id: "console.overview",
    label: "Overview",
    description: "Platform status board.",
    group: "console",
    defaultRoles: [ROLES.ADMIN, ROLES.SUPERADMIN],
    href: "/",
  },
  {
    id: "console.users",
    label: "Users",
    description: "Accounts, activation, role assignment.",
    group: "console",
    defaultRoles: [ROLES.ADMIN, ROLES.SUPERADMIN],
    href: "/users",
  },
  {
    id: "console.roles",
    label: "Roles",
    description: "Role definitions and grants.",
    group: "console",
    defaultRoles: [ROLES.ADMIN, ROLES.SUPERADMIN],
    href: "/roles",
  },
  {
    id: "console.permissions",
    label: "Permissions",
    description: "The permission catalog per group.",
    group: "console",
    defaultRoles: [ROLES.ADMIN, ROLES.SUPERADMIN],
    href: "/permissions",
  },
  {
    id: "console.audit",
    label: "Audit Logs",
    description: "The system event stream.",
    group: "console",
    defaultRoles: [ROLES.ADMIN, ROLES.SUPERADMIN],
    href: "/audit-logs",
  },
  {
    id: "console.seeds",
    label: "Seed Data",
    description: "Seed provider management.",
    group: "console",
    // Admin-visible by default: the real gate is the seeds.view permission
    // the console layout also checks, and narrowing this to superadmin here
    // would hide the section from admins who legitimately hold it.
    defaultRoles: [ROLES.ADMIN, ROLES.SUPERADMIN],
    href: "/seed-data",
  },
  {
    id: "console.subscriptions",
    label: "Subscriptions",
    description: "Provider accounts and plans.",
    group: "console",
    defaultRoles: [ROLES.ADMIN, ROLES.SUPERADMIN],
    href: "/subscriptions",
  },
  {
    id: "console.devices",
    label: "Devices",
    description: "Machines on the tailnet.",
    group: "console",
    defaultRoles: [ROLES.ADMIN, ROLES.SUPERADMIN],
    href: "/devices",
  },
  {
    id: "console.settings",
    label: "Settings",
    description: "Platform-wide configuration.",
    group: "console",
    defaultRoles: [ROLES.ADMIN, ROLES.SUPERADMIN],
    href: "/settings",
  },
  {
    id: "console.access",
    label: "Access Control",
    description: "This visibility matrix.",
    group: "console",
    defaultRoles: [ROLES.SUPERADMIN],
    href: "/access-control",
  },
];

/**
 * App-switcher entries, derived from the app registry rather than listed by
 * hand — a new app joins this matrix the moment it joins PLATFORM_APPS,
 * which is exactly the drift that hand-maintained menus kept reintroducing.
 */
const APP_MODULES: readonly NavModule[] = PLATFORM_APPS.map((app) => ({
  id: `app.${app.key}`,
  label: app.name,
  description: app.description,
  group: "apps" as const,
  // The registry's own access rule is the authority on who MAY enter; the
  // default here simply mirrors "everyone who may, sees it".
  defaultRoles: [ROLES.GUEST, ROLES.STANDARD_USER, ROLES.ADMIN, ROLES.SUPERADMIN],
}));

export const NAV_MODULES: readonly NavModule[] = [...CONSOLE_MODULES, ...APP_MODULES];

export function getNavModule(id: string): NavModule | undefined {
  return NAV_MODULES.find((module) => module.id === id);
}

/** Roles that can appear as columns in the matrix. */
export const MATRIX_ROLES: readonly RoleName[] = [
  ROLES.GUEST,
  ROLES.STANDARD_USER,
  ROLES.ADMIN,
  ROLES.SUPERADMIN,
];

/**
 * The PlatformSetting key holding the overrides.
 *
 * Deliberately absent from the admin settings catalog: this value has a
 * shape only the matrix editor produces, so the generic settings action
 * rejects it as an unknown key and cannot corrupt it.
 */
export const MODULE_VISIBILITY_KEY = "access.moduleVisibility";

/** moduleId → the exact set of roles that see it (an explicit override). */
export type ModuleOverrides = Record<string, RoleName[]>;

/**
 * Parse stored overrides, dropping anything that no longer matches the
 * registry. Modules get renamed and roles get deleted; a stale entry must
 * degrade to "use the default", never to a crash or a phantom module.
 */
export function parseModuleOverrides(raw: unknown): ModuleOverrides {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ModuleOverrides = {};
  for (const [moduleId, roles] of Object.entries(raw as Record<string, unknown>)) {
    if (!getNavModule(moduleId)) continue;
    if (!Array.isArray(roles)) continue;
    const valid = roles.filter((role): role is RoleName =>
      MATRIX_ROLES.includes(role as RoleName)
    );
    out[moduleId] = [...new Set(valid)];
  }
  return out;
}

/** Serialize a matrix back to storage shape, omitting untouched modules. */
export function serializeModuleOverrides(overrides: ModuleOverrides): ModuleOverrides {
  const out: ModuleOverrides = {};
  for (const [moduleId, roles] of Object.entries(overrides)) {
    const module = getNavModule(moduleId);
    if (!module) continue;
    const next = [...new Set(roles)].filter((role) => MATRIX_ROLES.includes(role));
    const isDefault =
      next.length === module.defaultRoles.length &&
      next.every((role) => module.defaultRoles.includes(role));
    if (isDefault) continue;
    out[moduleId] = next;
  }
  return out;
}

export interface ModuleVisibilityContext {
  roles: readonly string[];
  overrides?: ModuleOverrides;
}

/**
 * Whether a role set sees a module.
 *
 * Superadmin always sees everything. That is not a convenience: without it,
 * saving a matrix that hides console.access from superadmin would hide the
 * editor that could undo it, leaving no way back short of a database edit.
 */
export function isModuleVisible(
  moduleId: string,
  context: ModuleVisibilityContext
): boolean {
  if (context.roles.includes(ROLES.SUPERADMIN)) return true;
  const module = getNavModule(moduleId);
  if (!module) return false;
  const allowed = context.overrides?.[moduleId] ?? module.defaultRoles;
  return context.roles.some((role) => allowed.includes(role as RoleName));
}

/**
 * Read the stored overrides. Falls back to an empty override set — every
 * module then uses its registry default — so a database problem degrades to
 * standard navigation rather than an empty menu.
 */
export async function getModuleOverrides(): Promise<ModuleOverrides> {
  try {
    const row = await prisma.platformSetting.findUnique({
      where: { key: MODULE_VISIBILITY_KEY },
      select: { value: true },
    });
    return parseModuleOverrides(row?.value);
  } catch {
    return {};
  }
}

/**
 * App-switcher entries filtered by BOTH the access decision and the
 * visibility matrix. Access is still decided by canAccessApp — this only
 * removes entries an operator chose not to advertise to a role.
 */
export function filterModulesByVisibility<T extends { id: string }>(
  modules: readonly T[],
  context: ModuleVisibilityContext
): T[] {
  return modules.filter((module) => isModuleVisible(module.id, context));
}
