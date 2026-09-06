import "server-only";
import { z } from "zod";
import type { RequestContext } from "../context";
import { ApiError } from "../errors";
import { recordAudit } from "../events/emit";

/**
 * Minimal SCIM-style provisioning (docs: M15). Not a full SCIM 2.0 server —
 * a create/update/deactivate push keyed by an IdP `externalId`, logged in
 * `ScimEvent` for reconciliation. TasksAI still stores only the opaque
 * platform user id; the IdP maps its user to that id out of band.
 */
const userSchema = z.object({
  externalId: z.string().min(1).max(200),
  platformUserId: z.string().min(1),
  op: z.enum(["create", "update", "deactivate"]),
  role: z.enum(["admin", "member", "guest"]).optional(),
});

export async function scimPush(ctx: RequestContext, input: unknown) {
  if (ctx.actor.role !== "owner") throw new ApiError("forbidden");
  const d = userSchema.parse(input);

  let membershipId: string | null = null;
  if (d.op === "deactivate") {
    const m = await ctx.db.membership.updateMany({
      where: { workspaceId: ctx.workspaceId, platformUserId: d.platformUserId },
      data: { archivedAt: new Date() },
    });
    if (m.count === 0) throw new ApiError("not_found");
  } else {
    const m = await ctx.db.membership.upsert({
      where: { workspaceId_platformUserId: { workspaceId: ctx.workspaceId, platformUserId: d.platformUserId } },
      create: { workspaceId: ctx.workspaceId, platformUserId: d.platformUserId, role: d.role ?? "member" },
      update: { archivedAt: null, ...(d.role ? { role: d.role } : {}) },
    });
    membershipId = m.id;
  }

  const event = await ctx.db.scimEvent.create({
    data: { workspaceId: ctx.workspaceId, externalId: d.externalId, op: d.op, membershipId },
  });
  await recordAudit(ctx.db, ctx.workspaceId, `scim.${d.op}`, ctx.actor.membershipId, { externalId: d.externalId }, ctx.correlationId);
  return { eventId: event.id, op: d.op, membershipId };
}

export async function scimLog(ctx: RequestContext, limit = 100) {
  if (ctx.actor.role !== "owner" && ctx.actor.role !== "admin") throw new ApiError("forbidden");
  return ctx.db.scimEvent.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { receivedAt: "desc" },
    take: limit,
  });
}
