import "server-only";
import { z } from "zod";
import type { Prisma } from "../db/generated";
import type { RequestContext } from "../context";
import { ApiError } from "../errors";
import { recordAudit } from "../events/emit";
import { toCsv } from "../export/csv";

function requireAdmin(ctx: RequestContext) {
  if (ctx.actor.role !== "owner" && ctx.actor.role !== "admin") throw new ApiError("forbidden");
}
function requireOwner(ctx: RequestContext) {
  if (ctx.actor.role !== "owner") throw new ApiError("forbidden");
}

// ── audit search + export ────────────────────────────────────────────────

const auditQuery = z.object({
  name: z.string().optional(),
  actorId: z.string().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  cursor: z.string().optional(),
});

export async function searchAudit(ctx: RequestContext, input: unknown) {
  requireAdmin(ctx);
  const q = auditQuery.parse(input);
  const where: Prisma.AuditEventWhereInput = {
    workspaceId: ctx.workspaceId,
    ...(q.name ? { name: { contains: q.name } } : {}),
    ...(q.actorId ? { actorId: q.actorId } : {}),
    ...(q.since || q.until
      ? { occurredAt: { ...(q.since ? { gte: new Date(q.since) } : {}), ...(q.until ? { lte: new Date(q.until) } : {}) } }
      : {}),
  };
  const rows = await ctx.db.auditEvent.findMany({
    where,
    orderBy: { occurredAt: "desc" },
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > q.limit;
  return { items: rows.slice(0, q.limit), nextCursor: hasMore ? rows[q.limit - 1].id : null };
}

export async function exportAuditCsv(ctx: RequestContext, input: unknown) {
  requireAdmin(ctx);
  const { items } = await searchAudit(ctx, { ...(input as object), limit: 500 });
  return toCsv(
    items.map((e) => ({
      occurredAt: e.occurredAt.toISOString(),
      name: e.name,
      actorType: e.actorType,
      actorId: e.actorId ?? "",
      targetType: e.targetType ?? "",
      targetId: e.targetId ?? "",
      correlationId: e.correlationId ?? "",
      data: JSON.stringify(e.data),
    })),
    ["occurredAt", "name", "actorType", "actorId", "targetType", "targetId", "correlationId", "data"],
  );
}

// ── session / token / membership revocation ──────────────────────────────

export async function revokeMemberAccess(ctx: RequestContext, membershipId: string) {
  requireAdmin(ctx);
  if (membershipId === ctx.actor.membershipId) throw new ApiError("validation_failed", { reason: "cannot revoke yourself" });
  const m = await ctx.db.membership.findFirst({ where: { id: membershipId, workspaceId: ctx.workspaceId } });
  if (!m) throw new ApiError("not_found");
  if (m.role === "owner") requireOwner(ctx);

  await ctx.db.$transaction([
    ctx.db.membership.update({ where: { id: membershipId }, data: { archivedAt: new Date() } }),
    // revoke every API token that member issued
    ctx.db.apiToken.updateMany({
      where: { workspaceId: ctx.workspaceId, membershipId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  await recordAudit(ctx.db, ctx.workspaceId, "member.access_revoked", ctx.actor.membershipId, { membershipId }, ctx.correlationId);
  return { revoked: true };
}

// ── break-glass ──────────────────────────────────────────────────────────

const breakGlassSchema = z.object({
  grantedTo: z.string().min(1),
  reason: z.string().min(5).max(500),
  ticketRef: z.string().max(120).optional(),
  minutes: z.number().int().min(15).max(480).default(60),
});

export async function grantBreakGlass(ctx: RequestContext, input: unknown) {
  requireOwner(ctx);
  const d = breakGlassSchema.parse(input);
  const grant = await ctx.db.breakGlassGrant.create({
    data: {
      workspaceId: ctx.workspaceId,
      grantedTo: d.grantedTo,
      reason: d.reason,
      ticketRef: d.ticketRef,
      expiresAt: new Date(Date.now() + d.minutes * 60_000),
    },
  });
  await recordAudit(ctx.db, ctx.workspaceId, "breakglass.granted", ctx.actor.membershipId, {
    grantId: grant.id,
    grantedTo: d.grantedTo,
    ticketRef: d.ticketRef,
    expiresAt: grant.expiresAt.toISOString(),
  }, ctx.correlationId);
  return grant;
}

export async function activeBreakGlass(ctx: RequestContext) {
  requireAdmin(ctx);
  return ctx.db.breakGlassGrant.findMany({
    where: { workspaceId: ctx.workspaceId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeBreakGlass(ctx: RequestContext, id: string) {
  requireOwner(ctx);
  await ctx.db.breakGlassGrant.updateMany({
    where: { id, workspaceId: ctx.workspaceId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await recordAudit(ctx.db, ctx.workspaceId, "breakglass.revoked", ctx.actor.membershipId, { grantId: id }, ctx.correlationId);
  return { revoked: true };
}
