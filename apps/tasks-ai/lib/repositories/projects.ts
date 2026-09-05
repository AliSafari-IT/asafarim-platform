import "server-only";
import type { RequestContext } from "../context";

export interface ListOptions {
  cursor?: string;
  limit: number;
  includeArchived?: boolean;
}

/**
 * All reads are scoped by `ctx.workspaceId`. Handlers never pass a raw
 * workspace id; the lint rule forbids `ctx.db.project` calls outside this
 * directory (docs/adr/0002-tenant-model.md).
 */
export async function listProjects(ctx: RequestContext, opts: ListOptions) {
  const rows = await ctx.db.project.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(opts.includeArchived ? {} : { archivedAt: null }),
      // Guests only see projects they are a member of.
      ...(ctx.actor.role === "guest"
        ? { members: { some: { membership: { platformUserId: ctx.actor.platformUserId } } } }
        : {}),
    },
    orderBy: { createdAt: "asc" },
    take: opts.limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > opts.limit;
  return { items: rows.slice(0, opts.limit), nextCursor: hasMore ? rows[opts.limit - 1].id : null };
}

export async function getProject(ctx: RequestContext, id: string) {
  return ctx.db.project.findFirst({
    where: {
      id,
      workspaceId: ctx.workspaceId,
      ...(ctx.actor.role === "guest"
        ? { members: { some: { membership: { platformUserId: ctx.actor.platformUserId } } } }
        : {}),
    },
  });
}

export async function getProjectOr404(ctx: RequestContext, id: string) {
  const project = await getProject(ctx, id);
  if (!project) {
    const { ApiError } = await import("../errors");
    throw new ApiError("not_found");
  }
  return project;
}
