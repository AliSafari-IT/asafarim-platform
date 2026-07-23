import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/client";
import { generatedRecordRelations, generatedRecords } from "../db/schema";
import type { RuntimeContext } from "./runtimeAuth";
import { assertRuntimePermission, resolveRowAccessScope } from "./runtimeAuth";
import { findEntity } from "./validation";
import { ConflictError } from "../errors";
import type { GeneratedRecordRow } from "./records";

/**
 * The ONLY way to list generated records — a bounded query contract, never
 * arbitrary SQL/JSONPath/regex/executable expressions. Every filterable
 * field must be a real, non-archived field on the entity (checked against
 * the pinned specification, not trusted from the client); every filter
 * value is passed to Postgres as a bound parameter, never string-
 * concatenated into a query.
 */

export const QUERY_LIMITS = {
  MAX_PAGE_SIZE: 100,
  DEFAULT_PAGE_SIZE: 25,
  MAX_FILTERS: 10,
  MAX_SEARCH_LENGTH: 200,
} as const;

export type FilterOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains";

export interface FieldFilter {
  fieldId: string;
  op: FilterOperator;
  value: string | number | boolean;
}

/** Filters to records whose `relationFieldId` currently points at `recordId`. */
export interface RelationFilter {
  relationFieldId: string;
  recordId: string;
}

export interface ListRecordsOptions {
  page?: number;
  pageSize?: number;
  filters?: FieldFilter[];
  relationFilters?: RelationFilter[];
  sortFieldId?: string;
  sortDirection?: "asc" | "desc";
  search?: string;
  includeArchived?: boolean;
}

export interface ListRecordsResult {
  records: GeneratedRecordRow[];
  total: number;
  page: number;
  pageSize: number;
}

function jsonField(fieldId: string): SQL {
  return sql`(${generatedRecords.data}->>${fieldId})`;
}

function fieldCondition(filter: FieldFilter): SQL {
  const column = jsonField(filter.fieldId);
  switch (filter.op) {
    case "eq":
      return sql`${column} = ${String(filter.value)}`;
    case "neq":
      return sql`${column} <> ${String(filter.value)}`;
    case "gt":
      return sql`${column}::numeric > ${Number(filter.value)}`;
    case "gte":
      return sql`${column}::numeric >= ${Number(filter.value)}`;
    case "lt":
      return sql`${column}::numeric < ${Number(filter.value)}`;
    case "lte":
      return sql`${column}::numeric <= ${Number(filter.value)}`;
    case "contains":
      return sql`${column} ILIKE ${`%${String(filter.value)}%`}`;
  }
}

export async function listRecords(
  db: Db,
  ctx: RuntimeContext,
  entityId: string,
  options: ListRecordsOptions = {},
): Promise<ListRecordsResult> {
  assertRuntimePermission(ctx, entityId, "read");
  const entity = findEntity(ctx.spec, entityId);
  const allowedFieldIds = new Set(entity.fields.filter((f) => !f.archived).map((f) => f.id));

  const filters = options.filters ?? [];
  if (filters.length > QUERY_LIMITS.MAX_FILTERS) {
    throw new ConflictError(`Too many filters (max ${QUERY_LIMITS.MAX_FILTERS}).`);
  }
  for (const filter of filters) {
    if (!allowedFieldIds.has(filter.fieldId)) {
      throw new ConflictError(`Field "${filter.fieldId}" is not a filterable field on entity "${entityId}".`);
    }
  }
  if (options.sortFieldId && !allowedFieldIds.has(options.sortFieldId)) {
    throw new ConflictError(`Field "${options.sortFieldId}" is not a sortable field on entity "${entityId}".`);
  }
  if (options.search && options.search.length > QUERY_LIMITS.MAX_SEARCH_LENGTH) {
    throw new ConflictError(`Search text exceeds the maximum length of ${QUERY_LIMITS.MAX_SEARCH_LENGTH}.`);
  }
  for (const rf of options.relationFilters ?? []) {
    if (!allowedFieldIds.has(rf.relationFieldId)) {
      throw new ConflictError(`Field "${rf.relationFieldId}" is not a relation field on entity "${entityId}".`);
    }
  }

  const pageSize = Math.min(Math.max(options.pageSize ?? QUERY_LIMITS.DEFAULT_PAGE_SIZE, 1), QUERY_LIMITS.MAX_PAGE_SIZE);
  const page = Math.max(options.page ?? 1, 1);

  const conditions: SQL[] = [eq(generatedRecords.appId, ctx.appId), eq(generatedRecords.entityId, entityId)];
  if (!options.includeArchived) conditions.push(eq(generatedRecords.status, "active"));
  for (const filter of filters) conditions.push(fieldCondition(filter));
  for (const rf of options.relationFilters ?? []) conditions.push(sql`${jsonField(rf.relationFieldId)} = ${rf.recordId}`);
  if (options.search) {
    // Bounded, safe text search: ILIKE over every string-typed visible
    // field, never a full-text/regex/JSONPath expression.
    const textFieldIds = entity.fields.filter((f) => !f.archived && (f.type === "text" || f.type === "longText" || f.type === "email")).map((f) => f.id);
    if (textFieldIds.length > 0) {
      const clauses = textFieldIds.map((id) => sql`${jsonField(id)} ILIKE ${`%${options.search}%`}`);
      conditions.push(sql`(${sql.join(clauses, sql` OR `)})`);
    }
  }

  const scope = await resolveRowAccessScope(db, ctx, entityId, "read");
  if (scope.kind === "own") {
    conditions.push(eq(generatedRecords.createdByPrincipalId, ctx.actor.principalId));
  } else if (scope.kind === "assigned") {
    conditions.push(sql`${jsonField(scope.assigneeFieldId)} = ${ctx.actor.principalId}`);
  } else if (scope.kind === "relatedToParent") {
    // Bounded parent-scoping: only records whose parentRelationId field
    // points at a record the actor can currently read (recursion depth 1 —
    // the parent's OWN row-access is resolved with the same permission
    // check, never expanded further).
    const relation = ctx.spec.relations.find((r) => r.id === scope.parentRelationId && !r.archived);
    const parentFieldId = entity.fields.find((f) => !f.archived && f.type === "relation" && f.relationId === scope.parentRelationId)?.id;
    if (relation && parentFieldId) {
      const parentScope = await resolveRowAccessScope(db, ctx, relation.toEntityId, "read");
      if (parentScope.kind === "own") {
        conditions.push(
          sql`${jsonField(parentFieldId)} IN (SELECT id FROM generated_records WHERE app_id = ${ctx.appId} AND entity_id = ${relation.toEntityId} AND created_by_principal_id = ${ctx.actor.principalId})`,
        );
      }
      // parentScope "all": no extra narrowing needed (every parent is visible).
    } else {
      conditions.push(sql`false`);
    }
  }

  const whereClause = and(...conditions);
  const orderColumn = options.sortFieldId ? jsonField(options.sortFieldId) : generatedRecords.createdAt;
  const orderBy = options.sortDirection === "desc" ? desc(orderColumn) : asc(orderColumn);

  const [rows, totalRows] = await Promise.all([
    db.select().from(generatedRecords).where(whereClause).orderBy(orderBy).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ value: sql<number>`count(*)` }).from(generatedRecords).where(whereClause),
  ]);

  return { records: rows, total: Number(totalRows[0]?.value ?? 0), page, pageSize };
}

export interface DashboardCountResult {
  entityId: string;
  count: number;
}

/** Bounded aggregate: a single scoped count per requested entity — used by statWidget rendering. Never an arbitrary aggregate expression. */
export async function getDashboardCounts(db: Db, ctx: RuntimeContext, entityIds: string[]): Promise<DashboardCountResult[]> {
  const bounded = entityIds.slice(0, 20);
  const results: DashboardCountResult[] = [];
  for (const entityId of bounded) {
    try {
      const { total } = await listRecords(db, ctx, entityId, { pageSize: 1 });
      results.push({ entityId, count: total });
    } catch {
      results.push({ entityId, count: 0 });
    }
  }
  return results;
}

export interface GroupedCountResult {
  value: string;
  label: string;
  count: number;
}

/** Bounded group-by count over a single select field — the only aggregate shape chartWidget needs. */
export async function getGroupedCounts(db: Db, ctx: RuntimeContext, entityId: string, groupByFieldId: string): Promise<GroupedCountResult[]> {
  assertRuntimePermission(ctx, entityId, "read");
  const entity = findEntity(ctx.spec, entityId);
  const field = entity.fields.find((f) => !f.archived && f.id === groupByFieldId);
  if (!field || field.type !== "select") {
    throw new ConflictError(`Field "${groupByFieldId}" is not a select field on entity "${entityId}".`);
  }

  const result = await listRecords(db, ctx, entityId, { pageSize: QUERY_LIMITS.MAX_PAGE_SIZE });
  const counts = new Map<string, number>();
  for (const record of result.records) {
    const value = String((record.data as Record<string, unknown>)[groupByFieldId] ?? "");
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return field.options.map((option) => ({ value: option.value, label: option.label, count: counts.get(option.value) ?? 0 }));
}

/** Bounded reverse-relation listing — "every child record pointing at this parent" — used by detail views resolving a to-many side. */
export async function listRelatedRecords(
  db: Db,
  ctx: RuntimeContext,
  relationId: string,
  toRecordId: string,
  childEntityId: string,
  limit = 50,
): Promise<GeneratedRecordRow[]> {
  assertRuntimePermission(ctx, childEntityId, "read");
  const edges = await db
    .select({ fromRecordId: generatedRecordRelations.fromRecordId })
    .from(generatedRecordRelations)
    .where(and(eq(generatedRecordRelations.relationId, relationId), eq(generatedRecordRelations.toRecordId, toRecordId)))
    .limit(Math.min(limit, 200));
  if (edges.length === 0) return [];

  const ids = edges.map((e) => e.fromRecordId);
  // `inArray` (not a raw `sql`...= ANY(${ids})`` template) — node-postgres
  // does not bind a plain JS array parameter with an array type OID for a
  // hand-written `ANY($1)` clause, which fails at query time with "op
  // ANY/ALL (array) requires array on right side"; drizzle's `inArray`
  // generates a correctly-typed `IN (...)` clause instead.
  const rows = await db
    .select()
    .from(generatedRecords)
    .where(and(eq(generatedRecords.appId, ctx.appId), eq(generatedRecords.entityId, childEntityId), inArray(generatedRecords.id, ids), eq(generatedRecords.status, "active")));
  return rows;
}
