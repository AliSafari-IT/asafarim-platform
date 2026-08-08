/**
 * Fixed-window rate limiter. Pure logic against a minimal Redis-shaped
 * interface (not "server-only", not importing ioredis) so it's unit
 * testable without a real Redis connection — lib/server/redis.ts supplies
 * the real client at the call site.
 */
export interface RateLimitClient {
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<number>;
  pttl(key: string): Promise<number>;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Milliseconds until the current window resets. */
  retryAfterMs: number;
}

export interface RateLimitOptions {
  /** Max requests allowed within the window. */
  limit: number;
  windowSeconds: number;
}

/**
 * Checks and increments a fixed-window counter for `bucket:identity`.
 * The first request in a window sets the expiry; subsequent requests just
 * increment. Not perfectly smooth (fixed-window allows a burst at the
 * boundary) but simple, cheap, and sufficient for abuse-deterrence on a
 * guest-facing create/export endpoint — not a precision billing meter.
 */
export async function checkRateLimit(
  client: RateLimitClient,
  bucket: string,
  identity: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const key = `timelineai:ratelimit:${bucket}:${identity}`;
  const count = await client.incr(key);

  let ttl = await client.pttl(key);
  if (count === 1 || ttl < 0) {
    const windowMs = options.windowSeconds * 1000;
    await client.pexpire(key, windowMs);
    ttl = windowMs;
  }

  const allowed = count <= options.limit;
  return {
    allowed,
    limit: options.limit,
    remaining: Math.max(options.limit - count, 0),
    retryAfterMs: ttl,
  };
}
