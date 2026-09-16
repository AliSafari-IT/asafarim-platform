import "server-only";
import { Prisma } from "../db/generated";
import type { RequestContext } from "../context";
import { redact } from "./redact";
import type { AiKind } from "./types";

/**
 * Grounded context retrieval for the copilot (issue #232).
 *
 * `buildContext()` in job.ts used to pass only the project name plus a
 * handful of task titles — decomposition, planning and de-dup reasoned
 * almost blind. This module adds an authorization-scoped retrieval step
 * that surfaces the most relevant *existing* work (task title+description,
 * comment bodies, the project brief) so the model can ground new proposals
 * against it and cite a `source: "task:<id>"` instead of only an input span.
 *
 * Security-critical: this MUST replicate the exact guest scoping used by
 * `lib/search/index.ts` (`guestTaskScope` — guests only see tasks in
 * projects they belong to via `project_membership`/`membership`), and MUST
 * scope every query by `workspaceId`. A leak here is a cross-tenant data
 * leak into a provider prompt, so treat any change to the WHERE clauses in
 * this file as security-sensitive.
 *
 * Every snippet returned here passes through `redact()` before it is
 * returned — the same PII/secret scrubbing applied to user input — because
 * it is placed inside the untrusted fence in prompts.ts alongside it.
 */

/** Phase 1 (this PR): Postgres full-text search, same pattern as globalSearch. */
const MAX_SNIPPETS = 10;
/** Total character budget across all returned snippet bodies. */
const MAX_TOTAL_CHARS = 4000;
/** Per-snippet body cap, applied before the total budget. */
const MAX_SNIPPET_CHARS = 800;
/** `websearch_to_tsquery` degrades badly on very long inputs; keep it sane. */
const MAX_QUERY_CHARS = 500;

export interface RetrievedSnippet {
  /** "task:<id>" | "comment:<id>" | "project:<id>" */
  id: string;
  type: "task" | "comment" | "project";
  title: string;
  /** Redacted. */
  body: string;
  projectId?: string;
}

export interface RetrievalOptions {
  kind: AiKind;
  /** Already-redacted input — retrieval derives query terms from this, never the raw text. */
  redactedInput: string;
  projectId?: string;
}

/**
 * Phase 2 flag. When set, semantic (pgvector) recall would run instead of /
 * alongside FTS. **This is a documented no-op in this PR** — no pgvector
 * column, embedding backfill job, or worker change is implemented here; see
 * issue #232. Reading the flag now (rather than adding it later) means the
 * call site in job.ts and the eval/test surface don't need to change again
 * when Phase 2 lands — it will simply start doing something.
 */
export function embeddingsEnabled(): boolean {
  return process.env.TASKSAI_AI_EMBEDDINGS === "1";
}

/**
 * Rank and return the most relevant existing tasks/comments/project brief
 * for `opts`, scoped exactly like `globalSearch` (workspace + guest
 * project-membership). Returns `[]` on an empty query rather than falling
 * back to "everything" — an empty tsquery matches nothing anyway, but this
 * makes the no-signal case explicit.
 */
export async function retrieveContext(
  ctx: RequestContext,
  opts: RetrievalOptions,
): Promise<RetrievedSnippet[]> {
  if (embeddingsEnabled()) {
    // Phase 2 (out of scope for this PR): fall through to FTS. Real
    // semantic recall needs a pgvector column + backfill job on the worker
    // (ADR-0001: TasksAI keeps its own isolated database, so this can't
    // just reuse another app's embedding store) — deferred to a follow-up.
  }

  const query = opts.redactedInput.trim().slice(0, MAX_QUERY_CHARS);
  if (!query) return [];

  const ws = ctx.workspaceId;
  const guest = ctx.actor.role === "guest";
  const uid = ctx.actor.platformUserId;

  // Mirrors lib/search/index.ts's guestTaskScope exactly: guests only see
  // tasks (and, below, comments/projects) in projects they are a member of.
  const guestTaskScope = guest
    ? Prisma.sql`AND t."projectId" IN (
        SELECT pm."projectId" FROM "project_membership" pm
        JOIN "membership" m ON m.id = pm."membershipId"
        WHERE m."platformUserId" = ${uid} AND m."workspaceId" = ${ws})`
    : Prisma.empty;

  const snippets: RetrievedSnippet[] = [];

  const taskRows = await ctx.db.$queryRaw<
    { id: string; title: string; description: string | null; projectId: string }[]
  >(Prisma.sql`
      SELECT t.id, t.title, t.description, t."projectId"
      FROM "task" t
      WHERE t."workspaceId" = ${ws} AND t."archivedAt" IS NULL
        AND to_tsvector('english', coalesce(t.title,'') || ' ' || coalesce(t.description,''))
            @@ websearch_to_tsquery('english', ${query})
        ${guestTaskScope}
      ORDER BY (t."projectId" = ${opts.projectId ?? null}) DESC, t."updatedAt" DESC
      LIMIT ${MAX_SNIPPETS}`);
  for (const r of taskRows) {
    snippets.push({
      id: `task:${r.id}`,
      type: "task",
      title: r.title,
      body: r.description ?? "",
      projectId: r.projectId,
    });
  }

  const commentGuestScope = guest
    ? Prisma.sql`AND c."taskId" IN (
        SELECT t.id FROM "task" t
        JOIN "project_membership" pm ON pm."projectId" = t."projectId"
        JOIN "membership" m ON m.id = pm."membershipId"
        WHERE m."platformUserId" = ${uid} AND m."workspaceId" = ${ws})`
    : Prisma.empty;

  const commentRows = await ctx.db.$queryRaw<
    { id: string; body: string; taskId: string; projectId: string }[]
  >(Prisma.sql`
      SELECT c.id, c.body, c."taskId", t."projectId"
      FROM "comment" c
      JOIN "task" t ON t.id = c."taskId"
      WHERE c."workspaceId" = ${ws} AND c."deletedAt" IS NULL AND t."archivedAt" IS NULL
        AND to_tsvector('english', coalesce(c.body,'')) @@ websearch_to_tsquery('english', ${query})
        ${commentGuestScope}
      ORDER BY (t."projectId" = ${opts.projectId ?? null}) DESC, c."createdAt" DESC
      LIMIT ${MAX_SNIPPETS}`);
  for (const r of commentRows) {
    snippets.push({
      id: `comment:${r.id}`,
      type: "comment",
      title: `Comment on ${r.taskId}`,
      body: r.body,
      projectId: r.projectId,
    });
  }

  // Project brief: a single snippet for the project this job is scoped to.
  // Guests may only see it when they're a member of that project — the
  // guestTaskScope join pattern doesn't apply directly to `project`, so
  // check membership explicitly instead of trusting `opts.projectId`.
  if (opts.projectId) {
    const projectVisible = guest
      ? await ctx.db.projectMembership.findFirst({
          where: {
            projectId: opts.projectId,
            membership: { workspaceId: ws, platformUserId: uid },
          },
          select: { id: true },
        })
      : true;
    if (projectVisible) {
      const project = await ctx.db.project.findFirst({
        where: { id: opts.projectId, workspaceId: ws, archivedAt: null },
        select: { id: true, name: true, description: true },
      });
      if (project?.description) {
        snippets.push({
          id: `project:${project.id}`,
          type: "project",
          title: project.name,
          body: project.description,
          projectId: project.id,
        });
      }
    }
  }

  // Cap count, then redact + cap size per-snippet, then cap the total
  // character budget so the fenced context never balloons the prompt.
  const capped = snippets.slice(0, MAX_SNIPPETS);
  let budget = MAX_TOTAL_CHARS;
  const out: RetrievedSnippet[] = [];
  for (const s of capped) {
    if (budget <= 0) break;
    const redactedBody = redact(s.body).text.slice(0, MAX_SNIPPET_CHARS).slice(0, budget);
    budget -= redactedBody.length;
    out.push({ ...s, title: redact(s.title).text, body: redactedBody });
  }
  return out;
}
