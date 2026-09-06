import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { PLANS, type PlanTier } from "./plans";
import { stripeConfigured } from "./gate";

/**
 * Stripe adapter — **test mode only** in M14 (no live keys, per the run
 * decision). Every function no-ops or returns a stub when Stripe is not
 * configured (`stripeConfigured()` = billing open + STRIPE_SECRET_KEY set),
 * so the rest of the app works without it. The `stripe` SDK is imported
 * lazily so a build without the dep still compiles the billing service.
 */
async function client() {
  const { default: Stripe } = await import("stripe");
  return new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: "2025-08-27.basil" as never });
}

export async function createCheckoutSession(args: { workspaceId: string; tier: "pro" | "business"; seats: number }) {
  if (!stripeConfigured()) {
    return { url: null, stub: true, reason: "Stripe not configured (test mode, billing gate)" };
  }
  const stripe = await client();
  const plan = PLANS[args.tier];
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [
      {
        price_data: {
          currency: "eur",
          recurring: { interval: "month" },
          unit_amount: plan.priceCentsPerSeat ?? 0,
          product_data: { name: `TasksAI ${args.tier}` },
        },
        quantity: args.seats,
      },
    ],
    subscription_data: { trial_period_days: 14 },
    client_reference_id: args.workspaceId,
    success_url: `${process.env.NEXT_PUBLIC_TASKSAI_URL}/w/settings?checkout=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_TASKSAI_URL}/w/settings?checkout=cancel`,
  });
  return { url: session.url, stub: false };
}

export async function cancelStripeSubscription(subId: string) {
  if (!stripeConfigured()) return;
  const stripe = await client();
  await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
}

/**
 * Verify a Stripe webhook signature. Kept as a local HMAC check (matching
 * Stripe's `t=...,v1=...` scheme) so it is testable without the SDK; the
 * route uses `stripe.webhooks.constructEvent` when the SDK is present.
 */
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSec = 300,
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${payload}`).digest("hex");
  const provided = parts.v1 ?? "";
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

/** Map a Stripe subscription status string to our enum. */
export function mapStatus(s: string): "trialing" | "active" | "past_due" | "canceled" {
  if (s === "trialing") return "trialing";
  if (s === "active") return "active";
  if (s === "past_due" || s === "unpaid" || s === "incomplete") return "past_due";
  return "canceled";
}

export function tierFromProductName(name: string): PlanTier {
  const n = name.toLowerCase();
  if (n.includes("business")) return "business";
  if (n.includes("pro")) return "pro";
  if (n.includes("enterprise")) return "enterprise";
  return "free";
}
