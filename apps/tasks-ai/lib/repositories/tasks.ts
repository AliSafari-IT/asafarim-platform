import "server-only";
import type { Prisma, PrismaClient } from "../db/generated";
import type { RequestContext } from "../context";
import { ApiError } from "../errors";

export interface TaskFilter {
  projectId?: string;
  assigneeId?: string;
  statusId?: string;
  parentId?: string | null;
  includeArchived?: boolean;
  dueBefore?: Date;
  /**
   * Inbox semantics (issue #366): captured but not yet organized. `true`
   * narrows to the Inbox, `false` excludes it. See lib/capture/inbox.ts for
   * the rule this implements.
   */
  inbox?: boolean;
}

export interface ListOptions extends TaskFilter {
  cursor?: string;
  limit: number;
}

function scope(ctx: RequestContext, filter: TaskFilter): Prisma.TaskWhereInput {
  return {
    workspaceId: ctx.workspaceId,
    ...(filter.includeArchived ? {} : { archivedAt: null }),
    ...(filter.projectId ? { projectId: filter.projectId } : {}),
    ...(filter.assigneeId ? { assigneeId: filter.assigneeId } : {}),
    ...(filter.statusId ? { statusId: filter.statusId } : {}),
    ...(filter.parentId === null
      ? { parentId: null }
      : filter.parentId
        ? { parentId: filter.parentId }
        : {}),
    ...(filter.dueBefore ? { dueDate: { lte: filter.dueBefore } } : {}),
    ...(filter.inbox === true
      ? { triagedAt: null, completedAt: null }
      : filter.inbox === false
        ? { triagedAt: { not: null } }
        : {}),
    // Guests are limited to tasks in projects they belong to.
    ...(ctx.actor.role === "guest"
      ? { project: { members: { some: { membership: { platformUserId: ctx.actor.platformUserId } } } } }
      : {}),
  };
}

export async function listTasks(ctx: RequestContext, opts: ListOptions) {
  const rows = await ctx.db.task.findMany({
    where: scope(ctx, opts),
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    take: opts.limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > opts.limit;
  return { items: rows.slice(0, opts.limit), nextCursor: hasMore ? rows[opts.limit - 1].id : null };
}

export async function getTask(ctx: RequestContext, id: string) {
  return ctx.db.task.findFirst({ where: { id, ...scope(ctx, {}) } });
}

export async function getTaskOr404(ctx: RequestContext, id: string) {
  const task = await getTask(ctx, id);
  if (!task) throw new ApiError("not_found");
  return task;
}

/** Just enough of a transaction client to take a row lock. */
type RawRunner = Pick<PrismaClient, "$queryRaw">;

/**
 * Take a row lock on one task, inside a transaction.
 *
 * The parent/child same-project invariant spans two writes that touch
 * different rows — inserting a subtask (`createTask`) and moving a parent
 * into another project (`triageTask`) — so neither a conditional UPDATE nor
 * a pre-flight count can make them exclusive on its own. Both paths lock the
 * *parent* row first, which serializes them: whoever gets the lock decides
 * against state the other one will then read.
 *
 * A missing row is not an error here; the callers have already established
 * visibility and re-read under the lock.
 */
export async function lockTaskRow(tx: RawRunner, id: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "task" WHERE "id" = ${id} FOR UPDATE`;
}

/** Just enough of a transaction client to update one task. */
type TaskWriter = Pick<PrismaClient, "task">;

/**
 * Update one task, carrying the expected version into the WHERE clause when
 * the caller sent one. No matching row means somebody else got there first,
 * which is a 409 rather than a silent overwrite.
 *
 * The version belongs in the WHERE, not in a read-then-write check: two
 * concurrent stale writes must not both succeed. Shared by every
 * version-aware task mutation (triage, My Work quick edits) so they cannot
 * drift into different concurrency semantics.
 */
export async function updateTaskWithVersion(
  tx: TaskWriter,
  current: { id: string; version: number },
  expectedVersion: number | undefined,
  data: Prisma.TaskUncheckedUpdateInput,
) {
  try {
    return await tx.task.update({
      where: {
        id: current.id,
        ...(expectedVersion === undefined ? {} : { version: expectedVersion }),
      },
      data,
    });
  } catch (err) {
    if (
      expectedVersion !== undefined &&
      typeof err === "object" &&
      err !== null &&
      (err as { code?: unknown }).code === "P2025"
    ) {
      // No `current` version here: the one this function was handed predates
      // the write that just beat it, so reporting it would be a lie. The
      // caller re-reads the real one once its transaction has rolled back.
      throw new ApiError("conflict_version", { expected: expectedVersion });
    }
    throw err;
  }
}
