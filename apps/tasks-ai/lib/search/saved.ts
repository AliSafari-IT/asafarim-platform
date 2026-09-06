import "server-only";
import { z } from "zod";
import type { RequestContext } from "../context";
import { ApiError } from "../errors";

export const savedSearchSchema = z.object({
  name: z.string().min(1).max(120),
  query: z.string().min(1).max(500),
  filters: z.record(z.string(), z.unknown()).optional(),
});

export async function listSavedSearches(ctx: RequestContext) {
  return ctx.db.savedSearch.findMany({
    where: { workspaceId: ctx.workspaceId, membershipId: ctx.actor.membershipId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createSavedSearch(ctx: RequestContext, input: unknown) {
  const data = savedSearchSchema.parse(input);
  return ctx.db.savedSearch.create({
    data: {
      workspaceId: ctx.workspaceId,
      membershipId: ctx.actor.membershipId,
      name: data.name,
      query: data.query,
      filters: (data.filters ?? undefined) as never,
    },
  });
}

export async function deleteSavedSearch(ctx: RequestContext, id: string) {
  const res = await ctx.db.savedSearch.deleteMany({
    where: { id, workspaceId: ctx.workspaceId, membershipId: ctx.actor.membershipId },
  });
  if (res.count === 0) throw new ApiError("not_found");
  return { deleted: true };
}
