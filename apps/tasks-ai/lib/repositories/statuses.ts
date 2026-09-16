import "server-only";
import type { RequestContext } from "../context";

/**
 * Statuses are workspace-level with an optional per-project override
 * (`Status.projectId` is nullable). `listStatuses` returns the workspace
 * set plus any project-specific rows when `projectId` is given, ordered by
 * `position` — the order the board/list pickers render them in.
 */
export async function listStatuses(
  ctx: RequestContext,
  opts: { projectId?: string; includeArchived?: boolean } = {},
) {
  return ctx.db.status.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(opts.includeArchived ? {} : { archivedAt: null }),
      OR: opts.projectId ? [{ projectId: null }, { projectId: opts.projectId }] : [{ projectId: null }],
    },
    orderBy: { position: "asc" },
  });
}

export async function getStatus(ctx: RequestContext, id: string) {
  return ctx.db.status.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
}

export async function getStatusOr404(ctx: RequestContext, id: string) {
  const status = await getStatus(ctx, id);
  if (!status) {
    const { ApiError } = await import("../errors");
    throw new ApiError("not_found");
  }
  return status;
}
