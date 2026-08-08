import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { writeAuditEvent } from "../../../../lib/audit";
import { notifyDiscord } from "../../../../lib/server/discord-notify";
import {
  isRiskyTailscaleEvent,
  verifyTailscaleWebhook,
} from "../../../../lib/server/tailscale-webhook";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/tailscale
 *
 * Receives device/tailnet events from Tailscale
 * (https://tailscale.com/kb/1213/webhooks), configured in the Tailscale
 * console to point here with TAILSCALE_WEBHOOK_SECRET as the signing secret.
 * Must be publicly reachable (no session auth) — verification is by HMAC
 * signature instead, same shape as the Stripe webhook in
 * apps/edumatch/app/api/webhooks/stripe/route.ts.
 *
 * Every event is written to the shared audit log; risky events (a new
 * device joining, a key about to expire, a user being removed) also get a
 * Discord ping. Non-fatal by design — a failed audit write or notification
 * never turns into a 5xx, so Tailscale doesn't retry-storm us over it.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("Tailscale-Webhook-Signature");

  const event = verifyTailscaleWebhook(rawBody, signature);
  if (!event) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  console.log(`[Tailscale Webhook] ${event.type}`, event.data ?? {});

  const deviceLabel = event.data?.name || event.data?.hostname || event.data?.nodeId || "unknown device";

  await writeAuditEvent({
    userId: null,
    action: `tailscale.${event.type}`,
    entity: "TailscaleDevice",
    entityId: event.data?.nodeId ?? "unknown",
    changes: { message: event.message, data: event.data },
  });

  if (isRiskyTailscaleEvent(event.type)) {
    await notifyDiscord(
      `:satellite: **Tailscale** — \`${event.type}\` on ${deviceLabel}${event.message ? `\n${event.message}` : ""}`
    );
  }

  // Node lifecycle events change what the Devices page shows; drop its
  // cached render so the next visit reflects reality instead of stale data.
  if (event.type.startsWith("node")) {
    revalidatePath("/devices");
  }

  return NextResponse.json({ received: true });
}
