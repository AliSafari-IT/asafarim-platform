import { and, eq } from "drizzle-orm";
import type { ApplicationSpecificationType, PermissionType } from "@asafarim/appbuilder-schema";
import type { Db } from "../db/client";
import type { Actor } from "../auth/actor";
import {
  appDomains,
  previewBuilds,
  releases,
  specifications,
  specificationVersions,
  generatedRowAccessRules,
} from "../db/schema";
import { getOwnMembership, type GeneratedAppMemberRow } from "./membership";
import { ForbiddenError, NotFoundError } from "../errors";
import type { GeneratedEnvironment } from "./environment";

/**
 * The ONE central authorization layer for the generated app's own runtime
 * (page/entity/field/action/file/membership access) — every runtime API
 * route resolves a `RuntimeContext` here first and checks every mutation/
 * read against it. UI visibility is never itself a control: a client that
 * hides a button still hits this same server-side gate if it calls the
 * API directly.
 *
 * Deliberately independent of `lib/repositories/authz.ts` (M03's builder
 * capability system) — see lib/generated-data/membership.ts's docstring for
 * the identity-boundary rationale.
 */

export interface RuntimeContext {
  appId: string;
  actor: Actor;
  /**
   * M11: the data environment every repository call made with this context
   * reads and writes. NEVER client-supplied — it is derived server-side
   * from HOW the request arrived (a managed production host resolves
   * `production`; the builder's `/apps/{id}/preview` route resolves
   * `preview`) and defaults fail-closed to `preview` everywhere else. See
   * lib/generated-data/environment.ts and
   * docs/appbuilder-m11-releases-deployment.md#data-environment-separation.
   */
  environment: GeneratedEnvironment;
  /** Real persisted membership, or `null` only when `simulateRoleId` is active (builder role-simulation — see resolveRuntimeContext). */
  membership: GeneratedAppMemberRow | null;
  roleIds: string[];
  spec: ApplicationSpecificationType;
  specVersionNumber: number;
  /** M11: set only for a production context — the immutable release whose specification is being served. Null in preview. */
  releaseId: string | null;
  /** True only when this context was constructed via builder role-simulation — never true for a real generated-app end user, and never itself a source of API permission (see resolveRuntimeContext's docstring). */
  simulated: boolean;
}

/** Same "don't reveal whether this app/membership exists" contract as M03's assertCapability — a non-member gets the identical error a nonexistent app would. */
export class NotAMemberError extends NotFoundError {
  constructor(appId: string) {
    super("Generated app", appId);
    this.name = "NotAMemberError";
  }
}

export class RuntimePermissionDeniedError extends ForbiddenError {
  constructor(entityId: string, verb: string) {
    super(`Not permitted to ${verb} "${entityId}".`);
    this.name = "RuntimePermissionDeniedError";
  }
}

/**
 * Resolves the specification the generated-app RUNTIME actually validates
 * and enforces against — the app's PINNED, successfully-built preview
 * version (mirrors `previewService.ts#getPinnedPreview`'s own resolution),
 * never the latest DRAFT version. A builder can be mid-conversation (M08)
 * editing a draft while generated-app members keep using the last
 * successfully pinned version undisturbed — exactly the same "draft vs.
 * pinned preview" separation M06 already established for rendering; M09
 * data operations honor it too.
 */
export async function loadPinnedSpec(db: Db, appId: string): Promise<{ spec: ApplicationSpecificationType; versionNumber: number }> {
  const [spec] = await db.select().from(specifications).where(eq(specifications.appId, appId)).limit(1);
  if (!spec?.pinnedPreviewBuildId) throw new NotFoundError("Pinned preview for app", appId);

  const [build] = await db
    .select()
    .from(previewBuilds)
    .where(and(eq(previewBuilds.id, spec.pinnedPreviewBuildId), eq(previewBuilds.appId, appId)))
    .limit(1);
  if (!build || build.status !== "succeeded") throw new NotFoundError("Pinned preview for app", appId);

  const [version] = await db
    .select()
    .from(specificationVersions)
    .where(and(eq(specificationVersions.id, build.specificationVersionId), eq(specificationVersions.appId, appId)))
    .limit(1);
  if (!version) throw new NotFoundError("Specification version", build.specificationVersionId);
  return { spec: version.payload as unknown as ApplicationSpecificationType, versionNumber: version.versionNumber };
}

/**
 * M11: the PRODUCTION counterpart of `loadPinnedSpec`. Resolves the
 * specification a production request must be served from — the version
 * pinned by the app's ACTIVE RELEASE, never the draft and never the pinned
 * preview build.
 *
 * The active release is read from `app_domains.activeReleaseId` (the single
 * pointer a successful deployment moves atomically), never from a
 * client-supplied release id and never by "latest published release"
 * guesswork. If no domain is active, or the pointer is null, production has
 * nothing to serve and this throws the same leak-safe NotFoundError an
 * unknown app would.
 */
export async function loadActiveReleaseSpec(
  db: Db,
  appId: string,
): Promise<{ spec: ApplicationSpecificationType; versionNumber: number; releaseId: string }> {
  const [domain] = await db
    .select()
    .from(appDomains)
    .where(and(eq(appDomains.appId, appId), eq(appDomains.status, "active")))
    .limit(1);
  if (!domain?.activeReleaseId) throw new NotFoundError("Active production release for app", appId);

  const [release] = await db
    .select()
    .from(releases)
    .where(and(eq(releases.id, domain.activeReleaseId), eq(releases.appId, appId)))
    .limit(1);
  if (!release) throw new NotFoundError("Active production release for app", appId);

  const [version] = await db
    .select()
    .from(specificationVersions)
    .where(and(eq(specificationVersions.id, release.specificationVersionId), eq(specificationVersions.appId, appId)))
    .limit(1);
  if (!version) throw new NotFoundError("Specification version", release.specificationVersionId);

  return {
    spec: version.payload as unknown as ApplicationSpecificationType,
    versionNumber: version.versionNumber,
    releaseId: release.id,
  };
}

export interface ResolveRuntimeContextOptions {
  /**
   * Builder-only "view as role" inspection — see docs/appbuilder-m09-data-engine.md#role-simulation.
   * The CALLER (an API route) must have already independently verified the
   * requesting actor holds a real BUILDER capability (`app.viewPreview` at
   * minimum) before ever passing this — resolveRuntimeContext itself does
   * not check builder capability, so passing this from an unauthenticated
   * or unauthorized path would be a caller bug, not something this function
   * can catch from context alone. Never derived from a client-set cookie/
   * localStorage flag — always an explicit, server-validated query param on
   * a route the caller has already gated.
   */
  simulateRoleId?: string;
  /**
   * M11: which data environment this context reads/writes. NEVER derived
   * from client input — the caller must have established it from the
   * request's resolved host (see lib/routing/resolveAppHost.ts). Omitted
   * means `preview`, fail-closed.
   *
   * When `production`, the specification is resolved from the app's ACTIVE
   * RELEASE rather than its pinned preview build, and role simulation is
   * refused outright (see below) — a builder must never be able to "view
   * as" a role against real production data.
   */
  environment?: GeneratedEnvironment;
}

/** M11: role simulation is a builder inspection affordance for PREVIEW only. Allowing it in production would let a builder read real end-user data through a role they do not actually hold. */
export class SimulationNotAllowedInProductionError extends ForbiddenError {
  constructor() {
    super("Role simulation is not available against production data.");
    this.name = "SimulationNotAllowedInProductionError";
  }
}

/**
 * Resolves everything a runtime permission check needs: real membership
 * (or a simulated one — see options), the specification for the requested
 * ENVIRONMENT (pinned preview build for `preview`, the active release's
 * version for `production`), and the version it was pinned at. Throws
 * `NotAMemberError` (never a distinguishing error) for an authenticated
 * platform user with no active membership — they must not be able to tell
 * "not a member" apart from "app doesn't exist" or "not yet generated".
 */
export async function resolveRuntimeContext(
  db: Db,
  actor: Actor,
  appId: string,
  options: ResolveRuntimeContextOptions = {},
): Promise<RuntimeContext> {
  const environment: GeneratedEnvironment = options.environment ?? "preview";

  if (options.simulateRoleId && environment === "production") {
    throw new SimulationNotAllowedInProductionError();
  }

  const resolved =
    environment === "production"
      ? await loadActiveReleaseSpec(db, appId)
      : { ...(await loadPinnedSpec(db, appId)), releaseId: null as string | null };

  if (options.simulateRoleId) {
    return {
      appId,
      actor,
      environment,
      membership: null,
      roleIds: [options.simulateRoleId],
      spec: resolved.spec,
      specVersionNumber: resolved.versionNumber,
      releaseId: resolved.releaseId,
      simulated: true,
    };
  }

  const membership = await getOwnMembership(db, actor, appId, environment);
  if (!membership) throw new NotAMemberError(appId);

  return {
    appId,
    actor,
    environment,
    membership,
    roleIds: membership.roleIds,
    spec: resolved.spec,
    specVersionNumber: resolved.versionNumber,
    releaseId: resolved.releaseId,
    simulated: false,
  };
}

function permissionsFor(spec: ApplicationSpecificationType, roleIds: string[], entityId: string, verb: PermissionType["verb"]): PermissionType[] {
  return spec.permissions.filter((p) => roleIds.includes(p.roleId) && p.entityId === entityId && p.verb === verb);
}

/** Deny wins over allow when a member holds multiple roles with conflicting grants — never silently permissive. Absence of any matching permission is also a deny (default-closed). */
export function hasPermission(spec: ApplicationSpecificationType, roleIds: string[], entityId: string, verb: PermissionType["verb"]): boolean {
  const matches = permissionsFor(spec, roleIds, entityId, verb);
  if (matches.length === 0) return false;
  if (matches.some((p) => p.effect === "deny")) return false;
  return matches.some((p) => p.effect === "allow");
}

export function assertRuntimePermission(ctx: RuntimeContext, entityId: string, verb: PermissionType["verb"]): void {
  if (!hasPermission(ctx.spec, ctx.roleIds, entityId, verb)) {
    throw new RuntimePermissionDeniedError(entityId, verb);
  }
}

/** Whether `pageId` is reachable by this context — a page is visible if it carries no `requiredRoleIds`, or the member holds at least one of them. */
export function canViewPage(ctx: RuntimeContext, pageId: string): boolean {
  const page = ctx.spec.pages.find((p) => p.id === pageId && !p.archived);
  if (!page) return false;
  if (!page.requiredRoleIds || page.requiredRoleIds.length === 0) return true;
  return page.requiredRoleIds.some((id) => ctx.roleIds.includes(id));
}

export function listPermittedPageIds(ctx: RuntimeContext): string[] {
  return ctx.spec.pages.filter((p) => !p.archived && canViewPage(ctx, p.id)).map((p) => p.id);
}

// ─── Row-level access ───────────────────────────────────────────────────

export type RowAccessScope =
  | { kind: "all" }
  | { kind: "own" }
  | { kind: "assigned"; assigneeFieldId: string }
  | { kind: "relatedToParent"; parentRelationId: string };

const SCOPE_RANK: Record<RowAccessScope["kind"], number> = { all: 3, assigned: 2, own: 2, relatedToParent: 1 };

/**
 * Resolves the LEAST restrictive row-access rule across every role this
 * member holds for (entityId, verb) — a member with two roles, one scoped
 * to "own" and one to "all", sees "all". Absence of any configured rule for
 * an allowed permission means unrestricted access to every row the entity
 * permission itself allows (see generatedRowAccessRules's schema comment).
 */
export async function resolveRowAccessScope(
  db: Db,
  ctx: RuntimeContext,
  entityId: string,
  verb: PermissionType["verb"],
): Promise<RowAccessScope> {
  if (ctx.roleIds.length === 0) return { kind: "own" };

  const rows = await db
    .select()
    .from(generatedRowAccessRules)
    .where(
      and(
        eq(generatedRowAccessRules.appId, ctx.appId),
        eq(generatedRowAccessRules.environment, ctx.environment),
        eq(generatedRowAccessRules.entityId, entityId),
        eq(generatedRowAccessRules.verb, verb),
      ),
    );

  const applicable = rows.filter((r) => ctx.roleIds.includes(r.roleId));
  if (applicable.length === 0) return { kind: "all" };

  let best: RowAccessScope = toScope(applicable[0]);
  for (const row of applicable.slice(1)) {
    const candidate = toScope(row);
    if (SCOPE_RANK[candidate.kind] > SCOPE_RANK[best.kind]) best = candidate;
  }
  return best;
}

function toScope(row: typeof generatedRowAccessRules.$inferSelect): RowAccessScope {
  switch (row.ruleKind) {
    case "all":
      return { kind: "all" };
    case "own":
      return { kind: "own" };
    case "assigned":
      return { kind: "assigned", assigneeFieldId: String((row.ruleConfig as { assigneeFieldId?: string }).assigneeFieldId ?? "") };
    case "relatedToParent":
      return { kind: "relatedToParent", parentRelationId: String((row.ruleConfig as { parentRelationId?: string }).parentRelationId ?? "") };
  }
}

/**
 * Whether a specific already-fetched record satisfies the resolved row
 * scope for this actor. Used both to filter list queries (query.ts applies
 * the equivalent condition in SQL) and to double-check a single fetched
 * record (defense in depth — a record fetched by id must still pass this).
 */
export function recordSatisfiesScope(
  scope: RowAccessScope,
  actor: Actor,
  record: { createdByPrincipalId: string; data: Record<string, unknown> },
): boolean {
  switch (scope.kind) {
    case "all":
      return true;
    case "own":
      return record.createdByPrincipalId === actor.principalId;
    case "assigned":
      return record.data[scope.assigneeFieldId] === actor.principalId;
    case "relatedToParent":
      // Parent-relation scoping is resolved by query.ts (it needs a join
      // against the parent record's own row-access outcome); a single
      // already-fetched record without that context is conservatively
      // treated as NOT satisfying this scope kind — callers needing this
      // path must go through query.ts's relation-aware resolution instead.
      return false;
  }
}
