import { NextResponse } from "next/server";
import { correlationId, fail } from "../../../../lib/api/http";
import { getTasksAiDb } from "../../../../lib/db/client";
import { verifyStripeSignature, mapStatus } from "../../../../lib/billing/stripe";
import { isBillingOpen } from "../../../../lib/billing/gate";

// Stripe webhook. No session. 404s until billing is open and the webhook
// secret is set. Idempotent on the Stripe event id.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const cid = correlationId(req);
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!isBillingOpen() || !secret) return new NextResponse("Not found", { status: 404 });
    const body = await req.text();
    if (!verifyStripeSignature(body, req.headers.get("stripe-signature"), secret)) {
      return new NextResponse("bad signature", { status: 400 });
    }
    const event = JSON.parse(body) as { id: string; type: string; data: { object: Record<string, unknown> } };
    const db = getTasksAiDb();

    const seen = await db.billingEvent.findUnique({ where: { id: event.id } });
    if (seen) return NextResponse.json({ data: { deduped: true } });

    const obj = event.data.object;
    const meta = (obj.metadata as Record<string, string> | undefined) ?? {};
    const workspaceId = String(obj.client_reference_id ?? meta.workspaceId ?? "");

    if (workspaceId && (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created")) {
      await db.subscription.upsert({
        where: { workspaceId },
        create: {
          workspaceId,
          tier: "pro",
          status: mapStatus(String(obj.status ?? "active")),
          stripeCustomerId: String(obj.customer ?? ""),
          stripeSubId: String(obj.id ?? ""),
          currentPeriodEnd: obj.current_period_end ? new Date(Number(obj.current_period_end) * 1000) : null,
        },
        update: {
          status: mapStatus(String(obj.status ?? "active")),
          currentPeriodEnd: obj.current_period_end ? new Date(Number(obj.current_period_end) * 1000) : undefined,
        },
      });
    }
    if (workspaceId && event.type === "invoice.paid") {
      await db.invoice.create({
        data: {
          workspaceId,
          stripeInvoiceId: String(obj.id ?? ""),
          amountCents: Number(obj.amount_paid ?? 0),
          currency: String(obj.currency ?? "eur"),
          status: "paid",
          periodStart: new Date(),
          periodEnd: new Date(),
          hostedUrl: (obj.hosted_invoice_url as string) ?? null,
        },
      }).catch(() => {});
    }

    await db.billingEvent.create({ data: { id: event.id, type: event.type, workspaceId: workspaceId || null } });
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return fail(err, cid);
  }
}
