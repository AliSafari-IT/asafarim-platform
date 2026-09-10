import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * HMAC-SHA256 request signing for every webhook and machine-to-machine call
 * both directions (ADR-0002). Dependency-free — Node's crypto only — so it
 * can be imported by Testora (Drizzle app) and TasksAI (Prisma app) alike.
 *
 * Signed material is `${timestamp}.${deliveryId}.${rawBody}` so a replayed
 * body with a fresh timestamp does not verify, and a delivery id pins each
 * attempt. Verification is constant-time and supports two active secrets so
 * a secret can be rotated without downtime.
 */

export const SIGNATURE_HEADER = "x-asafarim-signature";
export const DELIVERY_HEADER = "x-asafarim-delivery";
export const TIMESTAMP_HEADER = "x-asafarim-timestamp";

/** Reject a delivery whose timestamp is further than this from now. */
export const DEFAULT_REPLAY_WINDOW_SECONDS = 300;

function computeSignature(
  secret: string,
  timestamp: number,
  deliveryId: string,
  rawBody: string,
): string {
  const mac = createHmac("sha256", secret);
  mac.update(`${timestamp}.${deliveryId}.${rawBody}`);
  return `sha256=${mac.digest("hex")}`;
}

export interface SignResult {
  timestamp: number;
  deliveryId: string;
  signature: string;
  headers: Record<string, string>;
}

export function signPayload(opts: {
  secret: string;
  rawBody: string;
  /** unix seconds; defaults to now */
  timestamp?: number;
  /** defaults to a fresh uuid */
  deliveryId?: string;
}): SignResult {
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const deliveryId = opts.deliveryId ?? randomUUID();
  const signature = computeSignature(
    opts.secret,
    timestamp,
    deliveryId,
    opts.rawBody,
  );
  return {
    timestamp,
    deliveryId,
    signature,
    headers: {
      [SIGNATURE_HEADER]: signature,
      [DELIVERY_HEADER]: deliveryId,
      [TIMESTAMP_HEADER]: String(timestamp),
    },
  };
}

export type VerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "missing_fields"
        | "malformed_timestamp"
        | "timestamp_out_of_window"
        | "signature_mismatch";
    };

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function verifySignature(opts: {
  /** one or more currently-valid secrets (rotation) */
  secret: string | string[];
  rawBody: string;
  signature: string | null | undefined;
  timestamp: string | number | null | undefined;
  deliveryId: string | null | undefined;
  replayWindowSeconds?: number;
  /** unix seconds; defaults to now — injectable for tests */
  now?: number;
}): VerifyResult {
  const { rawBody, signature, deliveryId } = opts;
  if (!signature || opts.timestamp == null || !deliveryId) {
    return { ok: false, reason: "missing_fields" };
  }

  const ts =
    typeof opts.timestamp === "number"
      ? opts.timestamp
      : Number.parseInt(opts.timestamp, 10);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: "malformed_timestamp" };
  }

  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const window = opts.replayWindowSeconds ?? DEFAULT_REPLAY_WINDOW_SECONDS;
  if (Math.abs(now - ts) > window) {
    return { ok: false, reason: "timestamp_out_of_window" };
  }

  const secrets = Array.isArray(opts.secret) ? opts.secret : [opts.secret];
  for (const secret of secrets) {
    const expected = computeSignature(secret, ts, deliveryId, rawBody);
    if (safeEqual(expected, signature)) {
      return { ok: true };
    }
  }
  return { ok: false, reason: "signature_mismatch" };
}
