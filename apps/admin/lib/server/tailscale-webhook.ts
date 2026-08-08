import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verification + typing for Tailscale's outbound webhooks
 * (https://tailscale.com/kb/1213/webhooks).
 *
 * Tailscale signs each POST with a `Tailscale-Webhook-Signature` header
 * shaped like `t=<unix-seconds>,v1=<hex hmac>`. The signed message is
 * `"{t}.{raw body}"`, HMAC-SHA256'd with the webhook's signing secret
 * (`TAILSCALE_WEBHOOK_SECRET`) — same shape as Stripe's signature scheme
 * used in apps/edumatch/app/api/webhooks/stripe/route.ts.
 *
 * A 5 minute tolerance guards against replaying an old captured request.
 */
const MAX_SIGNATURE_AGE_SECONDS = 5 * 60;

export interface TailscaleWebhookEvent {
  type: string;
  tailnet: string;
  timestamp: string;
  message?: string;
  data?: {
    nodeId?: string;
    hostname?: string;
    name?: string;
    [key: string]: unknown;
  };
}

/**
 * Verify the signature and return the parsed event, or null if the
 * signature is missing, malformed, stale, or doesn't match.
 */
export function verifyTailscaleWebhook(
  rawBody: string,
  signatureHeader: string | null
): TailscaleWebhookEvent | null {
  const secret = process.env.TAILSCALE_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return null;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k, v] as const;
    })
  );
  const timestamp = parts.t;
  const providedSig = parts.v1;
  if (!timestamp || !providedSig) return null;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > MAX_SIGNATURE_AGE_SECONDS) return null;

  const expectedSig = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const expected = Buffer.from(expectedSig, "hex");
  const provided = Buffer.from(providedSig, "hex");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as TailscaleWebhookEvent;
  } catch {
    return null;
  }
}

/** Event types worth a Discord ping rather than just a quiet audit-log line. */
const RISKY_EVENT_TYPES = new Set([
  "nodeCreated", // new device joined — needs a look/approval
  "nodeKeyExpiringInOneDay",
  "userDeleted",
]);

export function isRiskyTailscaleEvent(type: string): boolean {
  return RISKY_EVENT_TYPES.has(type);
}
