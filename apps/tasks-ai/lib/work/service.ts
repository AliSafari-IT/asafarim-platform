import "server-only";
import { z } from "zod";
import { Prisma } from "../db/generated";
import type { RequestContext } from "../context";
import { authorize } from "../authz";
import { ApiError } from "../errors";
import { emitActivity } from "../events/emit";
import { EVENT, OUTBOX_TYPE } from "../events/names";
import { getTaskOr404, lockTaskRow, updateTaskWithVersion } from "../repositories/tasks";
import {
  utcMidnight,
  MY_WORK_GROUP_ORDER,
  type MyWorkContextCounts,
  type MyWorkGroupId,
  type MyWorkItem,
  type MyWorkSummary,
} from "./my-work";

/**
 * Server side of My Work (issue #367).
 *
 * One read gives the execution view everything it promises: the viewer's
 * open, triaged work with project identity, status, dependency state — and
 * the workspace-level counts that let the page explain *why* it is empty
 * instead of saying "no tasks match the view".
 *
 * Scoped by `ctx.workspaceId` like every other read, and guests stay limited
 * to projects they belong to (internal docs: ventures/tasks-ai/adr/0002-tenant-model.md).
 */

export interface MyWorkPage {
  items: MyWorkItem[];
  nextCursor: string | null;
  /**
   * Counts over the *whole* scoped set, not this page: "3 overdue" has to
   * mean three overdue tasks exist, not three were on the page you happen to
   * have loaded. Computed as one aggregate, so it costs a count, not a fetch.
   */
  summary: MyWorkSummary;
  counts: MyWorkContextCounts;
}

export interface MyWorkOptions {
  cursor?: string;
  limit?: number;
  /** Injectable clock — the group boundaries are dates, so tests need one. */
  now?: Date;
}

const DEFAULT_PAGE = 50;

function guestProjectScope(ctx: RequestContext) {
  return ctx.actor.role === "guest"
    ? {
        project: { members: { some: { membership: { platformUserId: ctx.actor.platformUserId } } } },
      }
    : {};
}

/**
 * "My Work" as a query: assigned to me, open, and already triaged. An
 * untriaged capture is Inbox work, not planned work — the same rule the
 * saved-view model states (lib/views/model.ts, issue #366).
 */
function myWorkScope(ctx: RequestContext) {
  return {
    workspaceId: ctx.workspaceId,
    archivedAt: null,
    completedAt: null,
    assigneeId: ctx.actor.membershipId,
    triagedAt: { not: null },
    ...guestProjectScope(ctx),
  };
}

/**
 * The same scope as `myWorkScope`, expressed in SQL, plus the two things
 * Prisma's `orderBy` cannot express: the *group rank* a row will render under
 * and the sort key its group orders by.
 *
 * Both exist because My Work does not render in date order — it renders
 * overdue, today, blocked, upcoming, undated, and "blocked" depends on
 * whether an open task blocks this one. Paging in date order while rendering
 * in group order means page two can insert rows *above* rows already on
 * screen. So the database sorts by exactly what the UI sorts by:
 *
 *   rank 0 overdue · 1 today · 2 blocked · 3 upcoming · 4 undated
 *
 * and within a rank by one ascending `sort_key`:
 *   ranks 0–3 → due-date epoch, undated rows last (+Infinity), matching
 *               `sortWithinGroup`'s `byDue`;
 *   rank 4    → *negated* updatedAt epoch, so ascending means most recently
 *               touched first — the order `sortWithinGroup` gives undated
 *               work, and the reason it is `updatedAt` here too rather than
 *               `position`.
 * Ties break on position then id, again exactly as the client does.
 *
 * `groupIdFor` in lib/work/my-work.ts is the twin of this CASE. They must
 * agree; the integration tests pin that they do.
 */
function myWorkScopeSql(ctx: RequestContext, now: Date) {
  const today = utcMidnight(now);
  const tomorrow = utcMidnight(now, 1);
  const guest =
    ctx.actor.role === "guest"
      ? Prisma.sql`AND t."projectId" IN (
          SELECT pm."projectId" FROM "project_membership" pm
          JOIN "membership" m ON m.id = pm."membershipId"
          WHERE m."platformUserId" = ${ctx.actor.platformUserId}
            AND m."workspaceId" = ${ctx.workspaceId})`
      : Prisma.empty;

  return Prisma.sql`
    SELECT
      t.id,
      CASE
        WHEN t."dueDate" IS NOT NULL AND t."dueDate" < ${today} THEN 0
        WHEN t."dueDate" IS NOT NULL AND t."dueDate" < ${tomorrow} THEN 1
        WHEN EXISTS (
          SELECT 1 FROM "task_relation" r
          JOIN "task" b ON b.id = r."fromTaskId"
          WHERE r."toTaskId" = t.id AND r.kind = 'blocks'
            AND b."completedAt" IS NULL AND b."archivedAt" IS NULL
        ) THEN 2
        WHEN t."dueDate" IS NULL THEN 4
        ELSE 3
      END AS grp_rank,
      CASE
        WHEN t."dueDate" IS NULL AND NOT EXISTS (
          SELECT 1 FROM "task_relation" r
          JOIN "task" b ON b.id = r."fromTaskId"
          WHERE r."toTaskId" = t.id AND r.kind = 'blocks'
            AND b."completedAt" IS NULL AND b."archivedAt" IS NULL
        ) THEN -EXTRACT(EPOCH FROM t."updatedAt")::double precision
        ELSE COALESCE(EXTRACT(EPOCH FROM t."dueDate")::double precision, 'Infinity'::double precision)
      END AS sort_key,
      t."position" AS pos
    FROM "task" t
    WHERE t."workspaceId" = ${ctx.workspaceId}
      AND t."archivedAt" IS NULL
      AND t."completedAt" IS NULL
      AND t."assigneeId" = ${ctx.actor.membershipId}
      AND t."triagedAt" IS NOT NULL
      ${guest}`;
}

/**
 * One page of ids, in render order, keyset-paginated on the full sort tuple
 * rather than on the id alone — so page two continues exactly where page one
 * stopped and never inserts a row above something already on screen.
 *
 * A cursor whose row has left the scope (somebody completed it between
 * pages) yields an empty page, which is also what Prisma's `cursor` did:
 * the next refresh re-reads from the top anyway.
 */
async function myWorkOrderedIds(
  ctx: RequestContext,
  now: Date,
  limit: number,
  cursor?: string,
): Promise<string[]> {
  const scoped = myWorkScopeSql(ctx, now);
  const after = cursor
    ? Prisma.sql`WHERE (o.grp_rank, o.sort_key, o.pos, o.id) >
        (SELECT c.grp_rank, c.sort_key, c.pos, c.id FROM ordered c WHERE c.id = ${cursor})`
    : Prisma.empty;

  const rows = await ctx.db.$queryRaw<{ id: string }[]>(Prisma.sql`
    WITH ordered AS (${scoped})
    SELECT o.id FROM ordered o
    ${after}
    ORDER BY o.grp_rank, o.sort_key, o.pos, o.id
    LIMIT ${limit}`);
  return rows.map((r) => r.id);
}

/**
 * The group counts behind the summary line, over the entire scoped set. It is
 * a grouped `COUNT(*)` over the same predicate the list uses — no rows are
 * fetched or materialized, so it stays cheap as the list grows past a page.
 */
async function myWorkSummary(ctx: RequestContext, now: Date): Promise<MyWorkSummary> {
  const rows = await ctx.db.$queryRaw<{ grp_rank: number; n: bigint }[]>(Prisma.sql`
    WITH ordered AS (${myWorkScopeSql(ctx, now)})
    SELECT o.grp_rank, COUNT(*) AS n FROM ordered o GROUP BY o.grp_rank`);

  const summary: MyWorkSummary = {
    overdue: 0,
    today: 0,
    blocked: 0,
    upcoming: 0,
    undated: 0,
    total: 0,
  };
  for (const row of rows) {
    // The CASE above emits the index of the group in render order.
    const group: MyWorkGroupId | undefined = MY_WORK_GROUP_ORDER[Number(row.grp_rank)];
    if (!group) continue;
    const n = Number(row.n);
    summary[group] += n;
    summary.total += n;
  }
  return summary;
}

export async function myWorkData(
  ctx: RequestContext,
  opts: MyWorkOptions = {},
): Promise<MyWorkPage> {
  const limit = opts.limit ?? DEFAULT_PAGE;
  const now = opts.now ?? new Date();

  // One extra id tells us whether another page exists without a second query.
  const ids = await myWorkOrderedIds(ctx, now, limit + 1, opts.cursor);
  const hasMore = ids.length > limit;
  const pageIds = ids.slice(0, limit);

  const [rows, summary, counts] = await Promise.all([
    // The ordering already happened; this reads the page's rows and their
    // context by id, then restores that order.
    ctx.db.task.findMany({
      where: { id: { in: pageIds }, workspaceId: ctx.workspaceId },
      include: {
        project: { select: { key: true, name: true, isInbox: true } },
        status: { select: { name: true, category: true } },
        labels: { select: { label: { select: { name: true } } } },
        // Dependency state, counted over *open* neighbours only: a blocker
        // that is already done is not blocking anything.
        incomingRelations: {
          where: { kind: "blocks", fromTask: { completedAt: null, archivedAt: null } },
          select: { fromTaskId: true },
        },
        outgoingRelations: {
          where: { kind: "blocks", toTask: { completedAt: null, archivedAt: null } },
          select: { toTaskId: true },
        },
      },
    }),
    myWorkSummary(ctx, now),
    myWorkCounts(ctx),
  ]);

  const byId = new Map(rows.map((t) => [t.id, t]));
  const items: MyWorkItem[] = pageIds.flatMap((id) => {
    const t = byId.get(id);
    if (!t) return [];
    return [
      {
        id: t.id,
        title: t.title,
        projectId: t.projectId,
        projectKey: t.project.key,
        projectName: t.project.name,
        projectIsInbox: t.project.isInbox,
        statusName: t.status?.name ?? null,
        statusCategory: t.status?.category ?? null,
        assigneeId: t.assigneeId,
        dueDate: t.dueDate?.toISOString() ?? null,
        completedAt: t.completedAt?.toISOString() ?? null,
        blockedBy: t.incomingRelations.length,
        blocks: t.outgoingRelations.length,
        labels: t.labels.map((l) => l.label.name),
        position: t.position,
        updatedAt: t.updatedAt.toISOString(),
        version: t.version,
      },
    ];
  });

  return {
    items,
    nextCursor: hasMore ? (pageIds[pageIds.length - 1] ?? null) : null,
    summary,
    counts,
  };
}

/**
 * The counts behind the empty states. They answer questions the list itself
 * cannot: has this person ever been assigned anything, is everything done,
 * or is there unowned work they could pick up (issue #367, requirement 4).
 */
export async function myWorkCounts(ctx: RequestContext): Promise<MyWorkContextCounts> {
  const guest = guestProjectScope(ctx);
  const visible = { workspaceId: ctx.workspaceId, archivedAt: null, ...guest };

  const [
    assignedOpen,
    assignedInbox,
    assignedCompleted,
    workspaceOpen,
    workspaceUnowned,
    inboxWaiting,
  ] = await Promise.all([
    ctx.db.task.count({ where: myWorkScope(ctx) }),
    // Open work with my name on it that nobody has organized yet. It is not
    // in the list (My Work is triaged work) but it is emphatically mine, so
    // the empty state may not call me finished or unassigned.
    ctx.db.task.count({
      where: {
        ...visible,
        assigneeId: ctx.actor.membershipId,
        completedAt: null,
        triagedAt: null,
      },
    }),
    ctx.db.task.count({
      where: { ...visible, assigneeId: ctx.actor.membershipId, completedAt: { not: null } },
    }),
    ctx.db.task.count({ where: { ...visible, completedAt: null, triagedAt: { not: null } } }),
    ctx.db.task.count({
      where: { ...visible, completedAt: null, triagedAt: { not: null }, assigneeId: null },
    }),
    ctx.db.task.count({ where: { ...visible, completedAt: null, triagedAt: null } }),
  ]);

  return {
    assignedOpen,
    assignedInbox,
    assignedCompleted,
    workspaceOpen,
    workspaceUnowned,
    inboxWaiting,
    canPlan: ctx.actor.role !== "guest",
  };
}

// ──────────────────────────────────────────────────────────────────────
// Quick planning edits
// ──────────────────────────────────────────────────────────────────────

export const planSchema = z
  .object({
    /** `null` clears the date. */
    dueDate: z.union([z.string().datetime(), z.date()]).nullable(),
    /** `null` unassigns. */
    assigneeId: z.string().nullable(),
  })
  .partial()
  .refine((v) => "dueDate" in v || "assigneeId" in v, {
    message: "send a dueDate or an assigneeId",
  });

/**
 * The scoped quick-edit My Work rows use for "move to today / tomorrow /
 * later" and "assign to me / unassign" (issue #367, requirement 3).
 *
 * It is deliberately *the same semantics* as triage rather than a second,
 * incompatible editing path: the same assignee validation, the same
 * optimistic-concurrency contract, the same activity events. What it does
 * not do is stamp `triagedAt` — a row in My Work has already been organized.
 *
 * Concurrency: the row is locked with `lockTaskRow` before the conditional
 * update, so two quick edits racing from two devices serialize instead of
 * interleaving between the read and the write.
 */
export async function planTask(
  ctx: RequestContext,
  id: string,
  input: unknown,
  expectedVersion?: number,
) {
  authorize(ctx.actor, "task.update");
  const data = planSchema.parse(input);
  const current = await getTaskOr404(ctx, id);

  if (expectedVersion !== undefined && expectedVersion !== current.version) {
    throw new ApiError("conflict_version", { expected: expectedVersion, current: current.version });
  }

  // An owner must be a real, active, non-guest membership of *this*
  // workspace — without this a caller could hand work to a membership in
  // somebody else's workspace (same check as triage).
  if (data.assigneeId) {
    const assignee = await ctx.db.membership.findFirst({
      where: {
        id: data.assigneeId,
        workspaceId: ctx.workspaceId,
        archivedAt: null,
        role: { not: "guest" },
      },
      select: { id: true },
    });
    if (!assignee) throw new ApiError("not_found", { field: "assigneeId" });
  }

  try {
    return await ctx.db.$transaction(async (tx) => {
      await lockTaskRow(tx, current.id);

      const updated = await updateTaskWithVersion(tx, current, expectedVersion, {
        ...(data.dueDate !== undefined
          ? { dueDate: data.dueDate === null ? null : new Date(data.dueDate) }
          : {}),
        ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId } : {}),
        version: { increment: 1 },
      });

      await emitActivity(
        tx,
        ctx.workspaceId,
        ctx.correlationId,
        {
          name: EVENT.taskUpdated,
          targetType: "task",
          targetId: updated.id,
          actorId: ctx.actor.membershipId,
          data: { changed: Object.keys(data), from: "my_work" },
        },
        [{ type: OUTBOX_TYPE.searchIndex, payload: { taskId: updated.id } }],
      );

      if (data.assigneeId !== undefined && data.assigneeId !== current.assigneeId) {
        await emitActivity(tx, ctx.workspaceId, ctx.correlationId, {
          name: EVENT.taskAssigned,
          targetType: "task",
          targetId: updated.id,
          actorId: ctx.actor.membershipId,
          data: { assigneeId: data.assigneeId },
        });
      }

      return updated;
    });
  } catch (err) {
    // The conditional UPDATE lost the race. Now that the transaction has
    // rolled back, read the version the winner left behind so the 409 tells
    // the client what to reconcile against instead of echoing a stale number.
    if (err instanceof ApiError && err.code === "conflict_version") {
      const fresh = await ctx.db.task.findFirst({
        where: { id: current.id, workspaceId: ctx.workspaceId },
        select: { version: true },
      });
      throw new ApiError("conflict_version", {
        expected: expectedVersion,
        ...(fresh ? { current: fresh.version } : {}),
      });
    }
    throw err;
  }
}
