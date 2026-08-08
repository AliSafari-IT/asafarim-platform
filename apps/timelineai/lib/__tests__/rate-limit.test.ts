import { describe, expect, it } from "vitest";
import { checkRateLimit, type RateLimitClient } from "../rate-limit";

/** Minimal in-memory stand-in for the ioredis subset checkRateLimit needs. */
function createFakeClient(): RateLimitClient {
  const counts = new Map<string, number>();
  const expiresAt = new Map<string, number>();

  return {
    async incr(key) {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    },
    async pexpire(key, ms) {
      expiresAt.set(key, Date.now() + ms);
      return 1;
    },
    async pttl(key) {
      const at = expiresAt.get(key);
      if (!at) return -1;
      return Math.max(at - Date.now(), 0);
    },
  };
}

describe("checkRateLimit", () => {
  it("allows requests under the limit and reports remaining count", async () => {
    const client = createFakeClient();
    const first = await checkRateLimit(client, "create", "guest-a", { limit: 3, windowSeconds: 60 });
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(2);

    const second = await checkRateLimit(client, "create", "guest-a", { limit: 3, windowSeconds: 60 });
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(1);
  });

  it("blocks once the limit is exceeded", async () => {
    const client = createFakeClient();
    for (let i = 0; i < 3; i++) {
      await checkRateLimit(client, "create", "guest-b", { limit: 3, windowSeconds: 60 });
    }
    const fourth = await checkRateLimit(client, "create", "guest-b", { limit: 3, windowSeconds: 60 });
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
    expect(fourth.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks separate identities independently", async () => {
    const client = createFakeClient();
    for (let i = 0; i < 3; i++) {
      await checkRateLimit(client, "create", "guest-c", { limit: 3, windowSeconds: 60 });
    }
    const otherGuest = await checkRateLimit(client, "create", "guest-d", { limit: 3, windowSeconds: 60 });
    expect(otherGuest.allowed).toBe(true);
  });

  it("tracks separate buckets independently for the same identity", async () => {
    const client = createFakeClient();
    for (let i = 0; i < 3; i++) {
      await checkRateLimit(client, "create", "guest-e", { limit: 3, windowSeconds: 60 });
    }
    const exportBucket = await checkRateLimit(client, "export", "guest-e", { limit: 3, windowSeconds: 60 });
    expect(exportBucket.allowed).toBe(true);
  });
});
