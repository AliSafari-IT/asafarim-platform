import "server-only";
import Redis from "ioredis";

// Lazy connection, same pattern as apps/vionto/lib/server/queue.ts — importing
// this module during `next build` page-data collection must not throw just
// because REDIS_URL isn't set in that environment.
let _redis: Redis | undefined;

export function getRedis(): Redis {
  if (!_redis) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error(
        "REDIS_URL environment variable is required for guest rate limiting. " +
          "Please set it to redis://127.0.0.1:6379 or your Redis instance URL."
      );
    }
    _redis = new Redis(url, {
      // Rate limiting is a soft-fail concern (see guest-rate-limit.ts's
      // timeout wrapper) — this must never turn into ioredis's default
      // unbounded retry-forever behavior and block a guest's request.
      maxRetriesPerRequest: 1,
      connectTimeout: 1500,
      lazyConnect: false,
    });
    // ioredis emits "error" for every transient connection blip (e.g. a
    // reset while idle) even when maxRetriesPerRequest recovers cleanly;
    // without a listener that crashes the process. We log-and-continue —
    // callers still get real failures surfaced through command promises.
    _redis.on("error", (err) => {
      console.error("[timelineai] redis connection error:", err.message);
    });
  }
  return _redis;
}
