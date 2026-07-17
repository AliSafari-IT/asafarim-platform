import { ROLES } from "./roles";

/**
 * Central platform app registry.
 *
 * Single source of truth for which apps exist, how they present themselves
 * in launchers/admin surfaces, and who may open them. Access is derived
 * from roles — there is intentionally no per-user app-grant table; if one
 * is ever needed it gets its own schema design first.
 *
 * URL resolution stays in @asafarim/ui's getPlatformLinks(): active app
 * keys deliberately match PlatformLinks keys so callers can do
 * `links[app.key]`.
 */

export type PlatformAppStatus = "active" | "coming-soon";

/**
 * Who may open an app:
 * - "public"        — everyone, signed in or not
 * - "authenticated" — any signed-in active user
 * - string[]        — signed-in users holding at least one of these roles
 *                     (superadmin always passes)
 * - null            — nobody; deferred apps that have no implementation yet
 */
export type PlatformAppAccess = "public" | "authenticated" | string[] | null;

export interface PlatformApp {
  key: string;
  name: string;
  description: string;
  /** Short monospace glyph for launcher tiles, e.g. "WB". */
  glyph: string;
  /** Technical meta line, e.g. "asafarim.com". */
  meta: string;
  status: PlatformAppStatus;
  access: PlatformAppAccess;
}

export const PLATFORM_APPS: readonly PlatformApp[] = [
  {
    key: "web",
    name: "ASafarIM Digital",
    description: "The public studio website: services, projects, and contact.",
    glyph: "WB",
    meta: "asafarim.com",
    status: "active",
    access: "public",
  },
  {
    key: "hub",
    name: "Hub",
    description: "The signed-in workbench: dashboard, profile, and app launcher.",
    glyph: "HB",
    meta: "hub.asafarim.com",
    status: "active",
    access: "authenticated",
  },
  {
    // Route policy decision: Showcase stays public — it is the exhibition
    // wall for demos and case studies, same as the current deployment.
    key: "showcase",
    name: "Showcase",
    description: "The exhibition wall: demos, case studies, and experiments.",
    glyph: "SC",
    meta: "showcase.asafarim.be",
    status: "active",
    access: "public",
  },
  {
    key: "admin",
    name: "Admin Console",
    description: "Users, roles, permissions, and the audit stream.",
    glyph: "AD",
    meta: "admin.asafarim.com · restricted",
    status: "active",
    access: [ROLES.ADMIN],
  },
  {
    // Vionto's own proxy keeps the landing and creation entry public;
    // project work requires sign-in inside the app itself.
    key: "vionto",
    name: "Vionto",
    description: "Photo-to-story studio: turn photo collections into narrated videos.",
    glyph: "VN",
    meta: "vionto.asafarim.com · beta",
    status: "active",
    access: "public",
  },
  // ── Deferred apps: visible as coming-soon metadata only. No access is
  //    granted until their implementation PRs land. ─────────────────────
  {
    key: "edumatch",
    name: "EduMatch",
    description: "Explainable tutor-matching benchmark.",
    glyph: "EM",
    meta: "edumatch · planned",
    status: "coming-soon",
    access: null,
  },
  {
    key: "content-generator",
    name: "Content Generator",
    description: "Structured content drafting workspace.",
    glyph: "CG",
    meta: "content · planned",
    status: "coming-soon",
    access: null,
  },
  {
    key: "marketing-content",
    name: "Marketing Content",
    description: "Campaign and channel content planning.",
    glyph: "MC",
    meta: "marketing · planned",
    status: "coming-soon",
    access: null,
  },
] as const;

export interface AppAccessContext {
  /** Role names held by the user (empty for anonymous visitors). */
  roles: string[];
  /** Whether the user is signed in and active. */
  authenticated: boolean;
}

/** Deterministic explanation for an access decision. */
export type AppAccessReason =
  /* allowed */
  | "public" // app is open to everyone
  | "authenticated" // any signed-in active user may enter
  | "role" // one of the user's roles grants access
  | "superadmin" // explicit superadmin bypass
  /* denied */
  | "coming-soon" // app is registered but not yet built
  | "no-access-defined" // registered with access: null — nobody may enter
  | "not-authenticated" // app needs a session and there is none
  | "missing-role"; // signed in, but no qualifying role

export interface AppAccessDecision {
  allowed: boolean;
  reason: AppAccessReason;
}

/**
 * Evaluate whether a user (described by roles + auth state) may open an
 * app, with a deterministic reason for the decision. The superadmin
 * bypass is intentional and reported explicitly so it stays auditable.
 */
export function getAppAccessDecision(
  app: PlatformApp,
  context: AppAccessContext
): AppAccessDecision {
  if (app.status !== "active") return { allowed: false, reason: "coming-soon" };
  if (app.access === null) {
    return { allowed: false, reason: "no-access-defined" };
  }
  if (app.access === "public") return { allowed: true, reason: "public" };
  if (!context.authenticated) {
    return { allowed: false, reason: "not-authenticated" };
  }
  if (app.access === "authenticated") {
    return { allowed: true, reason: "authenticated" };
  }
  if (context.roles.includes(ROLES.SUPERADMIN)) {
    return { allowed: true, reason: "superadmin" };
  }
  if (context.roles.some((role) => (app.access as string[]).includes(role))) {
    return { allowed: true, reason: "role" };
  }
  return { allowed: false, reason: "missing-role" };
}

/** Whether a user (described by roles + auth state) may open an app. */
export function canAccessApp(
  app: PlatformApp,
  context: AppAccessContext
): boolean {
  return getAppAccessDecision(app, context).allowed;
}

/** Registry lookup by key. */
export function getPlatformApp(key: string): PlatformApp | undefined {
  return PLATFORM_APPS.find((app) => app.key === key);
}

/** Active apps a user may open — e.g. the derived "allowed apps" badges. */
export function getAccessibleApps(context: AppAccessContext): PlatformApp[] {
  return PLATFORM_APPS.filter((app) => canAccessApp(app, context));
}
