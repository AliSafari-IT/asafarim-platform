import "server-only";
import { Prisma } from "../db/generated";
import type { RequestContext } from "../context";

/**
 * Global keyword search across the caller's authorized projects, tasks,
 * comments, and labels (docs: M05). Uses Postgres `websearch_to_tsquery`
 * so `"draft brief" -done` style queries work; every statement is scoped
 * by workspaceId, and for guests further scoped to projects they belong
 * to. Nothing unauthorized can appear in results.
 *
 * The expression GIN indexes in scripts/search-indexes.sql make this fast
 * at scale; it is correct without them.
 */
export interface SearchHit {
  type: "task" | "project" | "comment" | "label";
  id: string;
  title: string;
  snippet?: string;
  projectId?: string;
}

const LIMIT_PER_TYPE = 15;

export async function globalSearch(
  ctx: RequestContext,
  q: string,
  opts: { types?: SearchHit["type"][] } = {},
): Promise<SearchHit[]> {
  const query = q.trim();
  if (!query) return [];
  const wants = (t: SearchHit["type"]) => !opts.types || opts.types.includes(t);
  const ws = ctx.workspaceId;
  const guest = ctx.actor.role === "guest";
  const uid = ctx.actor.platformUserId;
  const hits: SearchHit[] = [];

  const guestTaskScope = guest
    ? Prisma.sql`AND t."projectId" IN (
        SELECT pm."projectId" FROM "project_membership" pm
        JOIN "membership" m ON m.id = pm."membershipId"
        WHERE m."platformUserId" = ${uid} AND m."workspaceId" = ${ws})`
    : Prisma.empty;

  if (wants("task")) {
    const rows = await ctx.db.$queryRaw<{ id: string; title: string; projectId: string }[]>(Prisma.sql`
      SELECT t.id, t.title, t."projectId"
      FROM "task" t
      WHERE t."workspaceId" = ${ws} AND t."archivedAt" IS NULL
        AND to_tsvector('english', coalesce(t.title,'') || ' ' || coalesce(t.description,''))
            @@ websearch_to_tsquery('english', ${query})
        ${guestTaskScope}
      ORDER BY t."updatedAt" DESC
      LIMIT ${LIMIT_PER_TYPE}`);
    hits.push(...rows.map((r) => ({ type: "task" as const, id: r.id, title: r.title, projectId: r.projectId })));
  }

  if (wants("project") && !guest) {
    const rows = await ctx.db.$queryRaw<{ id: string; name: string }[]>(Prisma.sql`
      SELECT id, name FROM "project"
      WHERE "workspaceId" = ${ws} AND "archivedAt" IS NULL
        AND to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,''))
            @@ websearch_to_tsquery('english', ${query})
      LIMIT ${LIMIT_PER_TYPE}`);
    hits.push(...rows.map((r) => ({ type: "project" as const, id: r.id, title: r.name })));
  }

  if (wants("comment")) {
    const rows = await ctx.db.$queryRaw<{ id: string; body: string; taskId: string }[]>(Prisma.sql`
      SELECT c.id, c.body, c."taskId"
      FROM "comment" c
      WHERE c."workspaceId" = ${ws} AND c."deletedAt" IS NULL
        AND to_tsvector('english', coalesce(c.body,'')) @@ websearch_to_tsquery('english', ${query})
        ${guest ? Prisma.sql`AND c."taskId" IN (
          SELECT t.id FROM "task" t
          JOIN "project_membership" pm ON pm."projectId" = t."projectId"
          JOIN "membership" m ON m.id = pm."membershipId"
          WHERE m."platformUserId" = ${uid} AND m."workspaceId" = ${ws})` : Prisma.empty}
      ORDER BY c."createdAt" DESC
      LIMIT ${LIMIT_PER_TYPE}`);
    hits.push(
      ...rows.map((r) => ({
        type: "comment" as const,
        id: r.id,
        title: r.body.slice(0, 80),
        snippet: r.body.slice(0, 240),
      })),
    );
  }

  if (wants("label") && !guest) {
    const rows = await ctx.db.label.findMany({
      where: { workspaceId: ws, name: { contains: query, mode: "insensitive" } },
      take: LIMIT_PER_TYPE,
      select: { id: true, name: true },
    });
    hits.push(...rows.map((r) => ({ type: "label" as const, id: r.id, title: r.name })));
  }

  // Best-effort history write; never fails the search.
  ctx.db.searchHistory
    .create({ data: { workspaceId: ws, membershipId: ctx.actor.membershipId, query } })
    .catch(() => {});

  return hits;
}

export async function recentSearches(ctx: RequestContext, limit = 10) {
  const rows = await ctx.db.searchHistory.findMany({
    where: { workspaceId: ctx.workspaceId, membershipId: ctx.actor.membershipId },
    orderBy: { ranAt: "desc" },
    take: limit,
    select: { query: true, ranAt: true },
  });
  // de-dupe consecutive
  return rows.filter((r, i) => i === 0 || r.query !== rows[i - 1].query);
}
