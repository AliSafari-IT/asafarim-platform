import "server-only";
import { getRedis } from "./redis";
import { checkRateLimit, type RateLimitResult } from "../rate-limit";

/**
 * Per-bucket guest limits (spec §4: "Apply rate limits to guest creation,
 * submission, and export endpoints"). Keyed by the hashed guest IP —
 * callers must have already resolved one via getGuestIdHash() before
 * calling this; there is nothing meaningful to rate-limit without it.
 */
const GUEST_LIMITS = {
  create: { limit: 5, windowSeconds: 60 * 60 }, // 5 timelines/hour/guest
  export: { limit: 15, windowSeconds: 60 * 60 }, // 15 exports/hour/guest
} as const;

export class RateLimitedError extends Error {
  readonly status = 429;
  constructor(public readonly retryAfterMs: number) {
    super("You've hit the limit for this action as a guest. Please try again later, or sign in for unlimited use.");
    this.name = "RateLimitedError";
  }
}

const CHECK_TIMEOUT_MS = 1500;

/**
 * Enforces the guest rate limit, but fails OPEN (allows the request) if
 * Redis is slow or unreachable rather than blocking guest creation on an
 * unrelated infra dependency — abuse deterrence should never become an
 * outage vector. Failures are logged so a persistently-down Redis is still
 * visible in ops, just not user-facing.
 */
export async function enforceGuestRateLimit(
  bucket: keyof typeof GUEST_LIMITS,
  guestIdHash: string
): Promise<RateLimitResult | null> {
  try {
    const result = await Promise.race([
      checkRateLimit(getRedis(), bucket, guestIdHash, GUEST_LIMITS[bucket]),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("rate limit check timed out")), CHECK_TIMEOUT_MS)
      ),
    ]);
    if (!result.allowed) {
      throw new RateLimitedError(result.retryAfterMs);
    }
    return result;
  } catch (error) {
    if (error instanceof RateLimitedError) throw error;
    console.error(`[timelineai] rate limit check failed for bucket=${bucket}, failing open:`, error);
    return null;
  }
}
