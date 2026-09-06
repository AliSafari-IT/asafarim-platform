import "server-only";
import type { RequestContext } from "../context";
import { getTaskOr404 } from "../repositories/tasks";

export async function watch(ctx: RequestContext, taskId: string) {
  await getTaskOr404(ctx, taskId);
  await ctx.db.watcher.upsert({
    where: { taskId_membershipId: { taskId, membershipId: ctx.actor.membershipId } },
    create: { workspaceId: ctx.workspaceId, taskId, membershipId: ctx.actor.membershipId },
    update: {},
  });
  return { watching: true };
}

export async function unwatch(ctx: RequestContext, taskId: string) {
  await ctx.db.watcher.deleteMany({
    where: { taskId, membershipId: ctx.actor.membershipId, workspaceId: ctx.workspaceId },
  });
  return { watching: false };
}

export async function listWatchers(ctx: RequestContext, taskId: string) {
  await getTaskOr404(ctx, taskId);
  return ctx.db.watcher.findMany({
    where: { taskId, workspaceId: ctx.workspaceId },
    select: { membershipId: true, createdAt: true },
  });
}
