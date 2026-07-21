import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { emptySpecification, SPEC_SCHEMA_VERSION, ENGINE_VERSION, checksumOf as specChecksumOf } from "@asafarim/appbuilder-schema";
import type { Db } from "../db/client";
import {
  apps,
  collaborators,
  creationRequests,
  idempotencyKeys,
  specifications,
  specificationVersions,
} from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertCapability, type AppRow } from "./authz";
import { recordAuditEvent } from "./audit";
import { generateId } from "../db/ids";
import { checksumOf } from "../db/hash";
import { ConflictError } from "../errors";
import type { StarterFamily, Visibility } from "../validation/createApp";

const UNIQUE_VIOLATION = "23505";

export interface CreateAppInput {
  name: string;
  slug: string;
  description?: string;
  /**
   * The M05 creation intent. Optional here for M02/M03/M04 call sites
   * (seed scripts, pre-M05 tests) that predate the prompt-first flow —
   * defaults keep them valid without requiring every existing caller to
   * pass values a repository-level type shouldn't force business rules
   * about (that validation lives in lib/validation/createApp.ts, one layer
   * up, for the real M05 entry points).
   */
  prompt?: string;
  starterFamily?: StarterFamily;
  visibility?: Visibility;
}

/**
 * Creates an app, its initial (draft) specification container, and the
 * initial immutable version 1 (the schema package's empty/base
 * specification) in one transaction — plus the M05 creation-intent record
 * (prompt + starter family, for M07 to consume later) and an audit event.
 *
 * Deliberately does NOT insert a `collaborators` row for the owner: M03
 * established ownership as authoritative on `apps.ownerPrincipalId` alone
 * (see collaborators.ts#assertNotOwner) — adding one here would contradict
 * that invariant, not satisfy it.
 *
 * Idempotent on `idempotencyKey`: a retried request with the same key and
 * an equivalent payload replays the original result instead of creating a
 * second app; the same key reused with a different payload is rejected
 * (`ConflictError`, mapped to 409).
 */
export async function createApp(
  db: Db,
  actor: Actor,
  input: CreateAppInput,
  idempotencyKey: string,
): Promise<AppRow> {
  const requestHash = checksumOf(input);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, idempotencyKey))
      .limit(1);

    if (existing && existing.ownerPrincipalId === actor.principalId && existing.scope === "create-app") {
      if (existing.requestHash !== requestHash) {
        throw new ConflictError("Idempotency key reused with a different request payload");
      }
      if (existing.status === "in_progress") {
        throw new ConflictError("A create-app request with this idempotency key is already in progress");
      }
      if (existing.status === "completed" && existing.responseSnapshot) {
        const appId = (existing.responseSnapshot as { appId: string }).appId;
        const [app] = await tx.select().from(apps).where(eq(apps.id, appId)).limit(1);
        if (app) return app;
      }
    }

    const idempotencyRowId = existing?.id ?? generateId();
    if (!existing) {
      await tx.insert(idempotencyKeys).values({
        id: idempotencyRowId,
        ownerPrincipalId: actor.principalId,
        scope: "create-app",
        key: idempotencyKey,
        requestHash,
        status: "in_progress",
      });
    }

    const starterFamily: StarterFamily = input.starterFamily ?? "blank";
    const visibility: Visibility = input.visibility ?? "private";
    const prompt = input.prompt ?? "";

    const appId = generateId();
    let app: AppRow;
    try {
      [app] = await tx
        .insert(apps)
        .values({
          id: appId,
          ownerPrincipalId: actor.principalId,
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          visibility,
        })
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError(`An app with slug "${input.slug}" already exists`);
      }
      throw err;
    }

    const specificationId = generateId();
    const versionId = generateId();
    const baseSpec = emptySpecification({
      name: input.name,
      slug: input.slug,
      description: input.description,
    });

    await tx.insert(specifications).values({
      id: specificationId,
      appId,
      status: "draft",
      currentVersionNumber: 1,
    });

    await tx.insert(specificationVersions).values({
      id: versionId,
      specificationId,
      appId,
      versionNumber: 1,
      parentVersionId: null,
      schemaVersion: SPEC_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      summary: "Initial draft — empty base specification",
      payload: baseSpec,
      checksum: specChecksumOf(baseSpec),
      createdByPrincipalId: actor.principalId,
    });

    // The user's intent, persisted for M07 to interpret later. Product
    // state, not an audit entry — see schema.ts#creationRequests.
    await tx.insert(creationRequests).values({
      id: generateId(),
      appId,
      requestedByPrincipalId: actor.principalId,
      prompt,
      starterFamily,
      visibility,
    });

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "app.created",
      targetType: "app",
      targetId: appId,
      metadata: { starterFamily, visibility },
    });

    await tx
      .update(idempotencyKeys)
      .set({ status: "completed", responseSnapshot: { appId }, updatedAt: new Date() })
      .where(eq(idempotencyKeys.id, idempotencyRowId));

    return app;
  });
}

/** Scoped read — never call `apps.id` lookups without going through actor access. */
export async function getAppForActor(db: Db, actor: Actor, appId: string): Promise<AppRow> {
  const { app } = await assertCapability(db, actor, appId, "app.view");
  return app;
}

/**
 * Every app the actor owns or actively collaborates on. There is
 * intentionally no unscoped "list all apps" helper. Deliberately not
 * expanded by the platform superadmin bypass — that bypass exists for
 * acting on a specific, named app (assertCapability), not for dumping
 * every tenant's app registry through the list endpoint.
 */
export async function listAppsForActor(db: Db, actor: Actor): Promise<AppRow[]> {
  const collaboratorAppIds = await db
    .select({ appId: collaborators.appId })
    .from(collaborators)
    .where(eq(collaborators.principalId, actor.principalId));

  const ids = collaboratorAppIds.map((row) => row.appId);

  return db
    .select()
    .from(apps)
    .where(
      ids.length > 0
        ? or(eq(apps.ownerPrincipalId, actor.principalId), inArray(apps.id, ids))
        : eq(apps.ownerPrincipalId, actor.principalId),
    );
}

export type CatalogStatusFilter = "active" | "archived" | "all";
export type CatalogAccessFilter = "all" | "owned" | "shared";
export type CatalogSort = "updated" | "created" | "name";

export interface CatalogQuery {
  search?: string;
  status: CatalogStatusFilter;
  access: CatalogAccessFilter;
  sort: CatalogSort;
  /** 1-based. */
  page: number;
  pageSize: number;
}

export interface CatalogRow {
  app: AppRow;
  /** The actor's effective role on this app — never "owner" via the platform-superadmin bypass here. */
  role: "owner" | "editor" | "viewer";
}

export interface CatalogResult {
  rows: CatalogRow[];
  totalCount: number;
  page: number;
  pageSize: number;
}

/**
 * Escapes ILIKE wildcard metacharacters (`%`, `_`) and the escape character
 * itself in user-supplied search text, so a search for e.g. "50%_off"
 * matches that literal substring instead of being interpreted as a
 * wildcard pattern.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * The actor-scoped, paginated app catalog (M05). Every predicate —
 * ownership/collaboration, status, search, access — is applied inside this
 * query; nothing is filtered in memory or in the UI layer, and there is no
 * path to a full unscoped table scan. Unknown/out-of-range inputs must be
 * normalized by the caller (see lib/validation/catalogQuery.ts) before
 * reaching here — this function trusts its inputs are already valid.
 */
export async function listCatalogForActor(
  db: Db,
  actor: Actor,
  query: CatalogQuery,
): Promise<CatalogResult> {
  const collaboratorRows = await db
    .select({ appId: collaborators.appId, role: collaborators.role })
    .from(collaborators)
    .where(and(eq(collaborators.principalId, actor.principalId), eq(collaborators.status, "active")));

  const roleByAppId = new Map(collaboratorRows.map((row) => [row.appId, row.role]));
  const collaboratorAppIds = collaboratorRows.map((row) => row.appId);

  const accessPredicate =
    query.access === "owned"
      ? eq(apps.ownerPrincipalId, actor.principalId)
      : query.access === "shared"
        ? (collaboratorAppIds.length > 0 ? inArray(apps.id, collaboratorAppIds) : sql`false`)
        : (collaboratorAppIds.length > 0
            ? or(eq(apps.ownerPrincipalId, actor.principalId), inArray(apps.id, collaboratorAppIds))
            : eq(apps.ownerPrincipalId, actor.principalId));

  const statusPredicate = query.status === "all" ? undefined : eq(apps.status, query.status);

  const searchPredicate = query.search
    ? or(
        ilike(apps.name, `%${escapeLikePattern(query.search)}%`),
        ilike(apps.description, `%${escapeLikePattern(query.search)}%`),
      )
    : undefined;

  const where = and(accessPredicate, statusPredicate, searchPredicate);

  const orderBy =
    query.sort === "name"
      ? [asc(apps.name), asc(apps.id)]
      : query.sort === "created"
        ? [desc(apps.createdAt), asc(apps.id)]
        : [desc(apps.updatedAt), asc(apps.id)];

  const [rows, [{ count }]] = await Promise.all([
    db
      .select()
      .from(apps)
      .where(where)
      .orderBy(...orderBy)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(apps).where(where),
  ]);

  return {
    rows: rows.map((app) => ({
      app,
      role: app.ownerPrincipalId === actor.principalId ? "owner" : (roleByAppId.get(app.id) ?? "viewer"),
    })),
    totalCount: count,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/**
 * Idempotent: archiving an already-archived app is a no-op success (same
 * row returned, no duplicate audit event) so a refresh/retry/double-click
 * of the archive confirmation can never spam the audit log or error out.
 */
export async function archiveApp(db: Db, actor: Actor, appId: string): Promise<AppRow> {
  const { app: current } = await assertCapability(db, actor, appId, "app.archive");
  if (current.status === "archived") return current;

  return db.transaction(async (tx) => {
    const now = new Date();
    const [app] = await tx
      .update(apps)
      .set({ status: "archived", archivedAt: now, updatedAt: now })
      .where(eq(apps.id, appId))
      .returning();

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "app.archived",
      targetType: "app",
      targetId: appId,
    });

    return app;
  });
}

/** Idempotent counterpart to archiveApp — see its docstring. */
export async function restoreApp(db: Db, actor: Actor, appId: string): Promise<AppRow> {
  const { app: current } = await assertCapability(db, actor, appId, "app.restore");
  if (current.status === "active") return current;

  return db.transaction(async (tx) => {
    const now = new Date();
    const [app] = await tx
      .update(apps)
      .set({ status: "active", archivedAt: null, updatedAt: now })
      .where(eq(apps.id, appId))
      .returning();

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "app.restored",
      targetType: "app",
      targetId: appId,
    });

    return app;
  });
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === UNIQUE_VIOLATION;
}
