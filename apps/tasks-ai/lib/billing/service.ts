import "server-only";
import { z } from "zod";
import type { RequestContext } from "../context";
import { authorize } from "../authz";
import { ApiError } from "../errors";
import { recordAudit } from "../events/emit";
import {
  estimateMonthlyCents,
  hasFeature,
  meterView,
  PLANS,
  wouldExceed,
  type Feature,
  type Meter,
  type PlanTier,
} from "./plans";
import { assertBillingOpen, isBillingOpen } from "./gate";

function requireOwner(ctx: RequestContext) {
  if (ctx.actor.role !== "owner") throw new ApiError("forbidden");
}

function periodBounds(now = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

export async function getSubscription(ctx: RequestContext) {
  const sub = await ctx.db.subscription.findUnique({ where: { workspaceId: ctx.workspaceId } });
  return sub ?? { workspaceId: ctx.workspaceId, tier: "free" as PlanTier, status: "active", seats: 3 };
}

/** Effective tier: a past_due/canceled sub past its grace falls back to free. */
export async function effectiveTier(ctx: RequestContext): Promise<PlanTier> {
  const sub = await getSubscription(ctx);
  if (sub.tier === "free") return "free";
  const now = new Date();
  if (sub.status === "canceled" && (!("graceEndsAt" in sub) || !sub.graceEndsAt || sub.graceEndsAt < now)) return "free";
  if (sub.status === "past_due" && "graceEndsAt" in sub && sub.graceEndsAt && sub.graceEndsAt < now) return "free";
  return sub.tier as PlanTier;
}

/**
 * Feature gate for paid capabilities (ai, automations, integrations, …).
 * No-op until billing is open (the license gate) — the product runs
 * unrestricted while there is no commercial offering.
 */
export async function assertFeature(ctx: RequestContext, feature: Feature) {
  if (!isBillingOpen()) return;
  const tier = await effectiveTier(ctx);
  if (!hasFeature(tier, feature)) {
    throw new ApiError("forbidden", { reason: `${feature} is not included in the ${tier} plan` });
  }
}

/** Allowance gate — blocks overage rather than charging for it silently. */
export async function assertAllowance(ctx: RequestContext, meter: Meter, n = 1) {
  if (!isBillingOpen()) return;
  const tier = await effectiveTier(ctx);
  const { start, end } = periodBounds();
  const included = PLANS[tier].allowances[meter];
  const row = await ctx.db.usageMeter.upsert({
    where: { workspaceId_meter_periodStart: { workspaceId: ctx.workspaceId, meter, periodStart: start } },
    create: { workspaceId: ctx.workspaceId, meter, periodStart: start, periodEnd: end, included, used: 0 },
    update: {},
  });
  if (wouldExceed(tier, meter, row.used, row.topUp, n)) {
    throw new ApiError("rate_limited", {
      reason: `${meter} allowance reached for this billing period`,
      used: row.used,
      limit: row.included + row.topUp,
    });
  }
}

export async function recordUsage(ctx: RequestContext, meter: Meter, n = 1) {
  if (!isBillingOpen()) return;
  const { start, end } = periodBounds();
  const tier = await effectiveTier(ctx);
  await ctx.db.usageMeter.upsert({
    where: { workspaceId_meter_periodStart: { workspaceId: ctx.workspaceId, meter, periodStart: start } },
    create: { workspaceId: ctx.workspaceId, meter, periodStart: start, periodEnd: end, included: PLANS[tier].allowances[meter], used: n },
    update: { used: { increment: n } },
  });
}

/** Usage transparency (docs: M14) — what a customer sees before overage. */
export async function usageTransparency(ctx: RequestContext) {
  const tier = await effectiveTier(ctx);
  const sub = await getSubscription(ctx);
  const { start } = periodBounds();
  const meters = await ctx.db.usageMeter.findMany({
    where: { workspaceId: ctx.workspaceId, periodStart: start },
  });
  const view = (meter: Meter) => {
    const row = meters.find((m) => m.meter === meter);
    return meterView(tier, meter, row?.used ?? 0, row?.topUp ?? 0);
  };
  const ai = view("ai_proposals");
  const automations = view("automation_runs");
  return {
    tier,
    status: sub.status,
    billingOpen: isBillingOpen(),
    estimatedMonthlyCents: estimateMonthlyCents(tier, sub.seats),
    meters: [ai, automations],
    /** the meter closest to its limit — the visible cost driver */
    costDriver: ai.pressure >= automations.pressure ? "ai_proposals" : "automation_runs",
    note: "Allowances are enforced, not billed as surprise overage. Buy a top-up or upgrade to raise a limit.",
  };
}

// ── checkout / subscription lifecycle (Stripe test mode) ─────────────────

const checkoutSchema = z.object({
  tier: z.enum(["pro", "business"]),
  seats: z.number().int().min(1).max(500),
});

export async function startCheckout(ctx: RequestContext, input: unknown) {
  requireOwner(ctx);
  assertBillingOpen(); // hard gate — refuses until the license is signed
  const { tier, seats } = checkoutSchema.parse(input);
  const { createCheckoutSession } = await import("./stripe");
  const session = await createCheckoutSession({ workspaceId: ctx.workspaceId, tier, seats });
  await recordAudit(ctx.db, ctx.workspaceId, "billing.checkout_started", ctx.actor.membershipId, { tier, seats }, ctx.correlationId);
  return session;
}

export async function cancelSubscription(ctx: RequestContext) {
  requireOwner(ctx);
  const sub = await ctx.db.subscription.findUnique({ where: { workspaceId: ctx.workspaceId } });
  if (!sub || sub.tier === "free") throw new ApiError("validation_failed", { reason: "no paid subscription" });
  const graceEndsAt = sub.currentPeriodEnd ?? new Date(Date.now() + 14 * 86_400_000);
  const updated = await ctx.db.subscription.update({
    where: { workspaceId: ctx.workspaceId },
    data: { status: "canceled", canceledAt: new Date(), graceEndsAt },
  });
  if (isBillingOpen() && sub.stripeSubId) {
    const { cancelStripeSubscription } = await import("./stripe");
    await cancelStripeSubscription(sub.stripeSubId).catch(() => {});
  }
  await recordAudit(ctx.db, ctx.workspaceId, "billing.canceled", ctx.actor.membershipId, { graceEndsAt: graceEndsAt.toISOString() }, ctx.correlationId);
  return updated;
}

export async function listInvoices(ctx: RequestContext) {
  requireOwner(ctx);
  return ctx.db.invoice.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: "desc" } });
}
