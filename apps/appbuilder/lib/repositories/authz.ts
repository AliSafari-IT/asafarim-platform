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
  | "app.viewValidation" // view validation run/gate/artifact summaries (M10)
  | "app.validate" // request a validation run (M10)
  | "app.cancelValidation" // cancel an active validation run (M10)
  | "app.requestRepair" // request a bounded AI repair attempt (M10)
  | "app.cancelRepair" // cancel an active repair attempt (M10)
  | "app.confirmRepair" // confirm a destructive repair proposal (M10)
  | "app.approve" // approve a validated version (M10)
  | "app.deployRelease" // create/publish a release or deployment (M11)
  | "app.requestGeneration" // enqueue/resume an AI generation job (M07)
  | "app.viewGenerationJob" // view a generation job's status/progress (M07)
  | "app.cancelGeneration" // cancel an active generation job (M07)
  | "app.viewConversation" // view the builder workspace's conversation/message history (M08)
  | "app.requestModification" // send a conversational modification request (M08)
  | "app.cancelModification" // cancel an active modification job (M08)
  | "app.confirmModification" // confirm a destructive modification proposal (M08)
  | "app.undoOperation" // undo the last applied operation via its safe inverse (M08)
  | "app.restoreVersion" // restore an older specification version as a new version (M08)
  | "app.manageGeneratedMembers" // bootstrap/invite/re-role/revoke a GENERATED-APP member (M09) — a builder-side action, distinct from being a generated-app member oneself
  | "app.resetGeneratedData" // preview-only generated-record seed/reset (M09)
  | "app.viewOperations" // view the M12 launch-readiness/operations snapshot — viewers get a restricted subset, resolved in the aggregation route itself, not via a separate capability
  | "app.manageCustomDomainRequest" // create/cancel a (feature-flagged, inert) custom-domain readiness request (M12)
  | "app.uploadAttachment" // init/commit/delete a conversation attachment (M13)
  | "app.viewAttachment" // view a conversation attachment's metadata (M13)
  | "app.importReference" // import/refresh/remove a public HTTPS reference (M13 slice F)
  | "app.viewReference" // view an imported reference's metadata/provenance (M13 slice F)
  | "app.exportData" // export everything retained about this app, including M13 conversation data (M13 slice G)
  | "app.eraseData"; // irreversibly erase this app's retained conversation data (M13 slice G)

/** The minimum role each capability requires. Owner outranks editor outranks viewer. */
const CAPABILITY_MIN_ROLE: Record<Capability, Role> = {
  "app.view": "viewer",
  "app.viewPreview": "viewer",
  "app.editSpecification": "editor",
  "app.applyOperation": "editor",
  "app.manageCollaborators": "owner",
  "app.archive": "owner",
  "app.restore": "owner",
  "app.viewValidation": "viewer",
  "app.validate": "editor",
  "app.cancelValidation": "editor",
  "app.requestRepair": "editor",
  "app.cancelRepair": "editor",
  "app.confirmRepair": "editor",
  "app.approve": "owner",
  "app.deployRelease": "owner",
  "app.requestGeneration": "editor",
  "app.viewGenerationJob": "viewer",
  "app.cancelGeneration": "editor",
  // Conversational editing follows the same M03 policy as any other
  // specification edit: editors may propose/apply/undo, matching
  // app.editSpecification/app.applyOperation. Restoring an OLDER version is
  // reserved for owners — the issue's builder-workspace policy explicitly
  // separates "owner: full M08 editing and restoration capability" from
  // "editor: conversational/specification editing", so restore-as-new-
  // version is the one M08 action editors cannot perform.
  "app.viewConversation": "viewer",
  "app.requestModification": "editor",
  "app.cancelModification": "editor",
  "app.confirmModification": "editor",
  "app.undoOperation": "editor",
  "app.restoreVersion": "owner",
  // M09: builder-side control over the GENERATED app's own membership/data —
  // never to be confused with M03's owner/editor/viewer ranks governing the
  // AppBuilder workspace itself (see lib/generated-data/membership.ts's
  // module docstring for the full identity-boundary rationale).
  "app.manageGeneratedMembers": "owner",
  "app.resetGeneratedData": "editor",
  // M12: every related role (including viewer) may load SOME readiness
  // view — "viewers receive a restricted read-only summary" per the issue's
  // access rules — the restriction itself is applied inside the
  // aggregation route/service by trimming fields for role === "viewer",
  // not by a higher capability floor here (an unrelated actor is still
  // blocked entirely by assertCapability's NotFoundError-for-unrelated
  // behavior, same as every other capability).
  "app.viewOperations": "viewer",
  "app.manageCustomDomainRequest": "owner",
  // Same policy as app.requestModification: attachments exist to ground a
  // conversational edit, so editors may attach/remove them just like they
  // may otherwise edit the specification.
  "app.uploadAttachment": "editor",
  "app.viewAttachment": "viewer",
  // M13 slice F: importing a reference makes this platform send an outbound
  // request to a host the caller names, so it sits at the same floor as any
  // other specification-affecting action — never at viewer, which would let
  // read-only collaborators use the app as an outbound request proxy.
  "app.importReference": "editor",
  "app.viewReference": "viewer",
  // M13 slice G. Both are owner-only, for different reasons. Export produces
  // one document containing every message, attachment, memory fact, and
  // imported reference the app retains — a far broader read than any single
  // capability an editor holds, and the natural target for anyone who
  // obtained editor access. Erasure is irreversible.
  "app.exportData": "owner",
  "app.eraseData": "owner",
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
  "app.viewConversation",
  "app.viewValidation",
  "app.viewOperations",
  "app.viewAttachment",
  "app.viewReference",
  // M13 slice G: an archived app is the MOST likely subject of an export or
  // erasure request — archiving is the step before "I'm done with this" —
  // so blocking both while archived would force an owner to un-archive an
  // app just to delete its data.
  "app.exportData",
  "app.eraseData",
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
  capability: Capability
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
      `Actor lacks the "${capability}" capability on this app (role: ${access.role})`
    );
  }

  if (app.status === "archived" && !ALLOWED_WHILE_ARCHIVED.has(capability)) {
    throw new ConflictError(
      `App is archived — restore it before performing "${capability}"`
    );
  }

  return access;
}

async function resolveAccess(
  db: Db,
  actor: Actor,
  app: AppRow
): Promise<AppAccess | null> {
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
        eq(collaborators.status, "active")
      )
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
