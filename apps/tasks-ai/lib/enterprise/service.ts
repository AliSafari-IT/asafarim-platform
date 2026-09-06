import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { RequestContext } from "../context";
import { ApiError } from "../errors";
import { recordAudit } from "../events/emit";
import { assertFeature } from "../billing/service";

function requireOwner(ctx: RequestContext) {
  if (ctx.actor.role !== "owner") throw new ApiError("forbidden");
}

// ── domain claim ─────────────────────────────────────────────────────────

export async function claimDomain(ctx: RequestContext, domain: string) {
  requireOwner(ctx);
  await assertFeature(ctx, "sso"); // enterprise-only capability
  const norm = domain.trim().toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(norm)) throw new ApiError("validation_failed", { domain: "invalid" });
  const verifyToken = `tasksai-verify=${randomBytes(16).toString("hex")}`;
  try {
    const row = await ctx.db.domainClaim.create({
      data: { workspaceId: ctx.workspaceId, domain: norm, verifyToken },
    });
    await recordAudit(ctx.db, ctx.workspaceId, "domain.claimed", ctx.actor.membershipId, { domain: norm }, ctx.correlationId);
    return { id: row.id, domain: norm, verifyToken, dnsRecord: `TXT ${norm} "${verifyToken}"` };
  } catch (err) {
    if (typeof err === "object" && err && "code" in err && (err as { code?: unknown }).code === "P2002") {
      throw new ApiError("conflict_unique", { domain: "already claimed" });
    }
    throw err;
  }
}

/** In production this checks DNS; here the operator confirms out of band. */
export async function verifyDomain(ctx: RequestContext, id: string, autoJoin: boolean) {
  requireOwner(ctx);
  const res = await ctx.db.domainClaim.updateMany({
    where: { id, workspaceId: ctx.workspaceId },
    data: { verifiedAt: new Date(), autoJoin },
  });
  if (res.count === 0) throw new ApiError("not_found");
  await recordAudit(ctx.db, ctx.workspaceId, "domain.verified", ctx.actor.membershipId, { id, autoJoin }, ctx.correlationId);
  return { verified: true };
}

// ── service accounts ─────────────────────────────────────────────────────

const svcSchema = z.object({
  name: z.string().min(1).max(80),
  ipAllowlist: z.array(z.string().regex(/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/)).max(20).default([]),
  scopes: z.array(z.string()).min(1),
});

export async function createServiceAccount(ctx: RequestContext, input: unknown) {
  requireOwner(ctx);
  await assertFeature(ctx, "apiTokens");
  const d = svcSchema.parse(input);
  const { createToken } = await import("../tokens/service");
  const token = await createToken(ctx, { name: `svc:${d.name}`, scopes: d.scopes });
  const account = await ctx.db.serviceAccount.create({
    data: { workspaceId: ctx.workspaceId, name: d.name, tokenId: token.id, ipAllowlist: d.ipAllowlist },
  });
  await recordAudit(ctx.db, ctx.workspaceId, "serviceaccount.created", ctx.actor.membershipId, { id: account.id, name: d.name }, ctx.correlationId);
  return { id: account.id, name: d.name, token: token.token, ipAllowlist: d.ipAllowlist };
}

export async function disableServiceAccount(ctx: RequestContext, id: string) {
  requireOwner(ctx);
  const acc = await ctx.db.serviceAccount.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!acc) throw new ApiError("not_found");
  await ctx.db.$transaction([
    ctx.db.serviceAccount.update({ where: { id }, data: { disabledAt: new Date() } }),
    ...(acc.tokenId ? [ctx.db.apiToken.updateMany({ where: { id: acc.tokenId }, data: { revokedAt: new Date() } })] : []),
  ]);
  return { disabled: true };
}

/** Enforce a service account's IP allowlist. Called by the API surface. */
export function ipAllowed(allowlist: string[], ip: string): boolean {
  if (allowlist.length === 0) return true;
  return allowlist.some((entry) => cidrMatch(entry, ip));
}

function cidrMatch(cidr: string, ip: string): boolean {
  const [range, bitsRaw] = cidr.split("/");
  const bits = bitsRaw ? Number(bitsRaw) : 32;
  const toInt = (a: string) => a.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (toInt(range) & mask) === (toInt(ip) & mask);
}

// ── configurable retention + legal hold ──────────────────────────────────

const retentionSchema = z.object({
  activityDays: z.number().int().min(30).max(3650).nullable().optional(),
  auditDays: z.number().int().min(365).max(3650).nullable().optional(),
  outboxDays: z.number().int().min(7).max(365).nullable().optional(),
  notificationDays: z.number().int().min(7).max(730).nullable().optional(),
});

export async function setRetentionPolicy(ctx: RequestContext, input: unknown) {
  requireOwner(ctx);
  await assertFeature(ctx, "analytics"); // gate on a paid feature flag
  const d = retentionSchema.parse(input);
  const row = await ctx.db.retentionPolicy.upsert({
    where: { workspaceId: ctx.workspaceId },
    create: { workspaceId: ctx.workspaceId, ...d },
    update: d,
  });
  await recordAudit(ctx.db, ctx.workspaceId, "retention.policy_set", ctx.actor.membershipId, d, ctx.correlationId);
  return row;
}

export async function placeLegalHold(ctx: RequestContext, input: unknown) {
  requireOwner(ctx);
  const d = z.object({ reason: z.string().min(5).max(500), scope: z.string().min(1).max(60) }).parse(input);
  const row = await ctx.db.legalHold.create({
    data: { workspaceId: ctx.workspaceId, reason: d.reason, scope: d.scope, placedBy: ctx.actor.membershipId },
  });
  await recordAudit(ctx.db, ctx.workspaceId, "legalhold.placed", ctx.actor.membershipId, { id: row.id, scope: d.scope }, ctx.correlationId);
  return row;
}

export async function liftLegalHold(ctx: RequestContext, id: string) {
  requireOwner(ctx);
  const res = await ctx.db.legalHold.updateMany({
    where: { id, workspaceId: ctx.workspaceId, liftedAt: null },
    data: { liftedAt: new Date(), liftedBy: ctx.actor.membershipId },
  });
  if (res.count === 0) throw new ApiError("not_found");
  await recordAudit(ctx.db, ctx.workspaceId, "legalhold.lifted", ctx.actor.membershipId, { id }, ctx.correlationId);
  return { lifted: true };
}

/** Effective retention for a workspace: override → hold → platform default. */
export async function effectiveRetention(ctx: RequestContext) {
  const [policy, holds] = await Promise.all([
    ctx.db.retentionPolicy.findUnique({ where: { workspaceId: ctx.workspaceId } }),
    ctx.db.legalHold.count({ where: { workspaceId: ctx.workspaceId, liftedAt: null } }),
  ]);
  const DEFAULTS = { activityDays: 730, auditDays: 730, outboxDays: 30, notificationDays: 180 };
  return {
    ...DEFAULTS,
    ...(policy
      ? {
          activityDays: policy.activityDays ?? DEFAULTS.activityDays,
          auditDays: policy.auditDays ?? DEFAULTS.auditDays,
          outboxDays: policy.outboxDays ?? DEFAULTS.outboxDays,
          notificationDays: policy.notificationDays ?? DEFAULTS.notificationDays,
        }
      : {}),
    legalHoldActive: holds > 0,
    /** when a hold is active, retention deletion is suspended entirely */
    deletionSuspended: holds > 0,
  };
}

// ── audit streaming ──────────────────────────────────────────────────────

export async function configureAuditStream(ctx: RequestContext, url: string) {
  requireOwner(ctx);
  await assertFeature(ctx, "analytics");
  if (!url.startsWith("https://")) throw new ApiError("validation_failed", { url: "must be https" });
  const secret = randomBytes(24).toString("base64url");
  const row = await ctx.db.auditStream.upsert({
    where: { workspaceId: ctx.workspaceId },
    create: { workspaceId: ctx.workspaceId, url, secret },
    update: { url, active: true },
  });
  await recordAudit(ctx.db, ctx.workspaceId, "auditstream.configured", ctx.actor.membershipId, { url }, ctx.correlationId);
  return { id: row.id, url, secret };
}

/** Worker: push new audit events to the configured SIEM endpoint. */
export async function flushAuditStreams(db: RequestContext["db"]): Promise<{ pushed: number }> {
  const streams = await db.auditStream.findMany({ where: { active: true } });
  let pushed = 0;
  for (const s of streams) {
    const events = await db.auditEvent.findMany({
      where: { workspaceId: s.workspaceId, occurredAt: { gt: s.cursor } },
      orderBy: { occurredAt: "asc" },
      take: 200,
    });
    if (events.length === 0) continue;
    const body = JSON.stringify({ events });
    const ts = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", s.secret).update(`${ts}.${body}`).digest("hex");
    try {
      const res = await fetch(s.url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-tasksai-timestamp": String(ts), "x-tasksai-signature": sig },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        await db.auditStream.update({ where: { id: s.id }, data: { cursor: events[events.length - 1].occurredAt } });
        pushed += events.length;
      }
    } catch {
      /* retried next tick */
    }
  }
  return { pushed };
}

export function verifyAuditStreamSig(secret: string, body: string, ts: number, provided: string): boolean {
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}
