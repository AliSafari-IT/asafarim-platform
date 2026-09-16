import "server-only";
import type { RequestContext } from "../context";

export async function listLabels(ctx: RequestContext, opts: { includeArchived?: boolean } = {}) {
  return ctx.db.label.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(opts.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: { name: "asc" },
  });
}

export async function getLabel(ctx: RequestContext, id: string) {
  return ctx.db.label.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
}

export async function getLabelOr404(ctx: RequestContext, id: string) {
  const label = await getLabel(ctx, id);
  if (!label) {
    const { ApiError } = await import("../errors");
    throw new ApiError("not_found");
  }
  return label;
}

/** Labels currently on a task, for the detail drawer's "More details" section. */
export async function listTaskLabels(ctx: RequestContext, taskId: string) {
  const rows = await ctx.db.taskLabel.findMany({
    where: { taskId, label: { workspaceId: ctx.workspaceId } },
    include: { label: true },
  });
  return rows.map((r) => r.label);
}
