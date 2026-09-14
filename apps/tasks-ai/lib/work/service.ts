import "server-only";
import { z } from "zod";
import type { RequestContext } from "../context";
import { authorize } from "../authz";
import { ApiError } from "../errors";
import { emitActivity } from "../events/emit";
import { EVENT, OUTBOX_TYPE } from "../events/names";
import { getTaskOr404, lockTaskRow, updateTaskWithVersion } from "../repositories/tasks";
import {
  summarize,
  type MyWorkContextCounts,
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
 * to projects they belong to (docs/adr/0002-tenant-model.md).
 */

export interface MyWorkPage {
  items: MyWorkItem[];
  nextCursor: string | null;
  /** Counts over the rows fetched so far — the client re-derives as it pages. */
  summary: MyWorkSummary;
  counts: MyWorkContextCounts;
}

export interface MyWorkOptions {
  cursor?: string;
  limit?: number;
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

export async function myWorkData(
  ctx: RequestContext,
  opts: MyWorkOptions = {},
): Promise<MyWorkPage> {
  const limit = opts.limit ?? DEFAULT_PAGE;

  const rows = await ctx.db.task.findMany({
    where: myWorkScope(ctx),
    // The page order is the global execution order: earliest dates first,
    // undated last, tie-broken on position then id so paging is stable and
    // the first page is always the most urgent work.
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { position: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
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
  });

  const hasMore = rows.length > limit;
  const items: MyWorkItem[] = rows.slice(0, limit).map((t) => ({
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
  }));

  return {
    items,
    nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    summary: summarize(items),
    counts: await myWorkCounts(ctx),
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

  const [assignedOpen, assignedCompleted, workspaceOpen, workspaceUnowned, inboxWaiting] =
    await Promise.all([
      ctx.db.task.count({ where: myWorkScope(ctx) }),
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
