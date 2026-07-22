import { and, eq } from "drizzle-orm";
// Subpath import (not the full "@asafarim/auth" barrel): roles.ts has no
// runtime dependency on next-auth (only a type-only Session import), so
// this stays safe to import from plain Node contexts like vitest/scripts
// that never boot Next.js.
import { ROLES } from "@asafarim/auth/roles";
import type { Db } from "../db/client";
import { apps, collaborators } from "../db/schema";
import type { Actor } from "../auth/actor";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors";

export type Role = "viewer" | "editor" | "owner";

export type AppRow = typeof apps.$inferSelect;

const ROLE_RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };

/**
 * Named capabilities for the AppBuilder generated-app builder. This is the
 * single authorization contract every page, API route, and service —
 * including later milestones (M04 operations, M06 previews, M09 releases)
 * — must check against, instead of inventing scattered role comparisons.
 *
 * Some of these (validate/approve/deployRelease) have no real implementation
 * yet; they're defined now so the later code that fills them in has one
 * consistent place to ask "is this actor allowed to do X on this app".
 */
export type Capability =
  | "app.view" // list/view an app's metadata
  | "app.viewPreview" // view a preview build/render
  | "app.editSpecification" // append a specification version
  | "app.applyOperation" // apply a controlled operation (M04)
  | "app.manageCollaborators" // add/remove/re-role collaborators
  | "app.archive" // archive an app
  | "app.restore" // restore an archived app
  | "app.validate" // run validation gates (M10)
  | "app.approve" // approve a validated version (M10)
  | "app.deployRelease" // create/publish a release or deployment (M11)
  | "app.requestGeneration" // enqueue/resume an AI generation job (M07)
  | "app.viewGenerationJob" // view a generation job's status/progress (M07)
  | "app.cancelGeneration"; // cancel an active generation job (M07)

/** The minimum role each capability requires. Owner outranks editor outranks viewer. */
const CAPABILITY_MIN_ROLE: Record<Capability, Role> = {
  "app.view": "viewer",
  "app.viewPreview": "viewer",
  "app.editSpecification": "editor",
  "app.applyOperation": "editor",
  "app.manageCollaborators": "owner",
  "app.archive": "owner",
  "app.restore": "owner",
  "app.validate": "editor",
  "app.approve": "owner",
  "app.deployRelease": "owner",
  "app.requestGeneration": "editor",
  "app.viewGenerationJob": "viewer",
  "app.cancelGeneration": "editor",
};

/** Whether a role grants a capability. Exported so tests/UI can render capability-gated affordances consistently. */
export function roleGrants(role: Role, capability: Capability): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[CAPABILITY_MIN_ROLE[capability]];
}

/**
 * Capabilities still usable on an archived app (M05). Everything else —
 * every edit/mutate/publish path — is blocked while archived, so an
 * archived app can never accidentally accept a normal edit operation; the
 * only way back in is explicitly restoring it first.
 */
const ALLOWED_WHILE_ARCHIVED: ReadonlySet<Capability> = new Set([
  "app.view",
  "app.viewPreview",
  "app.archive",
  "app.restore",
  "app.viewGenerationJob",
]);

export interface AppAccess {
  app: AppRow;
  /** The actor's effective role on this app ("owner" for the platform superadmin bypass). */
  role: Role;
  /** True when access was granted only via the platform superadmin bypass. */
  viaSuperadmin: boolean;
}

/**
 * The single chokepoint for app-scoped access. Every repository method that
 * touches an app-owned table must call this first — there is deliberately
 * no lower-level "get app by id" helper that skips it, so a caller cannot
 * accidentally read/write another owner's data.
 *
 * - Unknown app, or an actor with no relationship to it at all (not the
 *   owner, not an active collaborator, not a platform superadmin): throws
 *   NotFoundError in both cases, indistinguishably — an unrelated caller
 *   must not be able to tell "doesn't exist" apart from "exists, but not
 *   yours" (see issue #32: "avoid leaking whether an inaccessible app
 *   exists").
 * - Actor IS related (owner, active collaborator, or superadmin) but their
 *   role doesn't meet the capability's minimum: throws ForbiddenError —
 *   they already know the app exists, they just can't do this.
 *
 * The platform superadmin bypass mirrors the existing, documented platform
 * policy (packages/auth's hasRole/getAppAccessDecision: superadmin always
 * passes) — it is not a bypass invented for AppBuilder.
 */
export async function assertCapability(
  db: Db,
  actor: Actor,
  appId: string,
  capability: Capability,
): Promise<AppAccess> {
  const [app] = await db.select().from(apps).where(eq(apps.id, appId)).limit(1);
  if (!app) {
    throw new NotFoundError("App", appId);
  }

  const access = await resolveAccess(db, actor, app);
  if (!access) {
    // Unrelated actor: same error as "app doesn't exist" — see docstring.
    throw new NotFoundError("App", appId);
  }

  if (!roleGrants(access.role, capability)) {
    throw new ForbiddenError(
      `Actor lacks the "${capability}" capability on this app (role: ${access.role})`,
    );
  }

  if (app.status === "archived" && !ALLOWED_WHILE_ARCHIVED.has(capability)) {
    throw new ConflictError(
      `App is archived — restore it before performing "${capability}"`,
    );
  }

  return access;
}

async function resolveAccess(db: Db, actor: Actor, app: AppRow): Promise<AppAccess | null> {
  if (app.ownerPrincipalId === actor.principalId) {
    return { app, role: "owner", viaSuperadmin: false };
  }

  const [collaborator] = await db
    .select()
    .from(collaborators)
    .where(
      and(
        eq(collaborators.appId, app.id),
        eq(collaborators.principalId, actor.principalId),
        eq(collaborators.status, "active"),
      ),
    )
    .limit(1);

  if (collaborator) {
    return { app, role: collaborator.role, viaSuperadmin: false };
  }

  if (actor.roles.includes(ROLES.SUPERADMIN)) {
    return { app, role: "owner", viaSuperadmin: true };
  }

  return null;
}
