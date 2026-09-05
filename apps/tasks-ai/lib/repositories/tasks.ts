import "server-only";
import type { Prisma } from "../db/generated";
import type { RequestContext } from "../context";
import { ApiError } from "../errors";

export interface TaskFilter {
  projectId?: string;
  assigneeId?: string;
  statusId?: string;
  parentId?: string | null;
  includeArchived?: boolean;
  dueBefore?: Date;
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
