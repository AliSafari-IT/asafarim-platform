import { describe, expect, it } from "vitest";
import { clientKey, createAdmissionController, DEFAULT_LIMITS, isSameOrigin, limitsFromEnv, readBodyLimited, type AdmissionLimits } from "./admission";

const limits: AdmissionLimits = {
  requests: { limit: 3, windowMs: 60_000 },
  perTool: { limit: 2, windowMs: 60_000 },
  perClient: { limit: 3, windowMs: 60_000 },
  maxConcurrent: 2,
  dailyBudgetMicros: BigInt(1_000),
};
const clock = (start = Date.UTC(2026, 8, 27, 12)) => {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
};
const granted = <T,>(x: T) => {
  if (!(x as { ok: boolean }).ok) throw new Error(`denied: ${JSON.stringify(x)}`);
  return x as Extract<T, { ok: true }>;
};

describe("admission controller", () => {
  it("limits requests per client with a sliding window and a retry hint", () => {
    const c = clock();
    const a = createAdmissionController(limits, c.now);
    for (let i = 0; i < 3; i++) expect(a.request("x")).toBeNull();
    expect(a.request("x")).toEqual({ ok: false, code: "rate_limited", retryAfterSeconds: 60 });
    expect(a.request("y")).toBeNull();
    c.advance(60_001);
    expect(a.request("x")).toBeNull();
  });

  it("forgets a client's hashed id once its longest window has passed", () => {
    const c = clock();
    const a = createAdmissionController(limits, c.now);
    a.request("x");
    expect(a.snapshot().trackedClients).toBe(1);
    c.advance(60_001);
    expect(a.snapshot().trackedClients).toBe(0);
  });

  it("limits live runs per tool and per client, without charging a denied run", () => {
    const c = clock();
    const a = createAdmissionController(limits, c.now);
    granted(a.admitLive("x", "t1", BigInt(1))).release(BigInt(1));
    granted(a.admitLive("x", "t1", BigInt(1))).release(BigInt(1));
    expect(a.admitLive("x", "t1", BigInt(1))).toMatchObject({ ok: false, code: "rate_limited" });
    granted(a.admitLive("x", "t2", BigInt(1))).release(BigInt(1));
    // Per-client cap (3) reached across tools; the denied t1 attempt didn't count.
    expect(a.admitLive("x", "t3", BigInt(1))).toMatchObject({ ok: false, code: "rate_limited" });
    expect(a.admitLive("y", "t1", BigInt(1)).ok).toBe(true);
  });

  it("allows one in-flight call per client and caps global concurrency", () => {
    const a = createAdmissionController({ ...limits, perTool: { limit: 99, windowMs: 1 }, perClient: { limit: 99, windowMs: 1 } });
    const first = granted(a.admitLive("x", "t", BigInt(1)));
    expect(a.admitLive("x", "t", BigInt(1))).toMatchObject({ ok: false, code: "rate_limited" });
    const second = granted(a.admitLive("y", "t", BigInt(1)));
    expect(a.admitLive("z", "t", BigInt(1))).toMatchObject({ ok: false, code: "rate_limited" });
    first.release(null);
    first.release(null); // idempotent
    expect(a.snapshot().inFlight).toBe(1);
    expect(a.admitLive("z", "t", BigInt(1)).ok).toBe(true);
    second.release(null);
  });

  it("reserves worst-case cost against the daily budget and settles to the recorded estimate", () => {
    const c = clock();
    const a = createAdmissionController({ ...limits, perTool: { limit: 99, windowMs: 1 }, perClient: { limit: 99, windowMs: 1 } }, c.now);
    const lease = granted(a.admitLive("x", "t", BigInt(800)));
    expect(a.admitLive("y", "t", BigInt(300))).toMatchObject({ ok: false, code: "quota_exceeded" });
    lease.release(BigInt(100));
    expect(a.snapshot().reservedMicros).toBe(BigInt(100));
    granted(a.admitLive("y", "t", BigInt(300))).release(null); // unknown cost keeps the worst case
    expect(a.snapshot().reservedMicros).toBe(BigInt(400));
    const denied = a.admitLive("z", "t", BigInt(700));
    expect(denied).toMatchObject({ ok: false, code: "quota_exceeded", retryAfterSeconds: 12 * 3600 });
    c.advance(12 * 3600 * 1000);
    expect(a.admitLive("z", "t", BigInt(700)).ok).toBe(true);
  });

  it("reads limits from env and ignores malformed values", () => {
    expect(limitsFromEnv({})).toEqual(DEFAULT_LIMITS);
    const l = limitsFromEnv({ AI_TOOLS_RUNS_PER_HOUR: "5", AI_TOOLS_MAX_CONCURRENT: "-1", AI_TOOLS_DAILY_BUDGET_USD: "1.5", AI_TOOLS_REQUESTS_PER_5_MIN: "lots" });
    expect(l.perClient.limit).toBe(5);
    expect(l.maxConcurrent).toBe(DEFAULT_LIMITS.maxConcurrent);
    expect(l.dailyBudgetMicros).toBe(BigInt(1_500_000));
    expect(l.requests.limit).toBe(DEFAULT_LIMITS.requests.limit);
  });
});

describe("client identity", () => {
  const salt = Buffer.from("fixed-test-salt!");
  const key = (h: Record<string, string>) => clientKey(new Headers(h), salt);

  it("uses the rightmost forwarded address (the one Caddy saw) and never the raw address", () => {
    const k = key({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" });
    expect(k).toBe(key({ "x-forwarded-for": "203.0.113.9" }));
    expect(k).not.toBe(key({ "x-forwarded-for": "6.6.6.6" }));
    expect(k).toMatch(/^[0-9a-f]{32}$/);
    expect(k).not.toContain("203");
  });

  it("puts callers without an address in one shared bucket", () => {
    expect(key({})).toBe(key({ "user-agent": "other" }));
  });

  it("changes with the per-process salt, so hashes can't be linked across restarts", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "203.0.113.9" }), Buffer.from("another-salt-000"))).not.toBe(key({ "x-forwarded-for": "203.0.113.9" }));
  });
});

describe("request guards", () => {
  const req = (h: Record<string, string>) => new Request("https://asafarim.com/api/tools/x/run", { method: "POST", headers: h });

  it.each([
    [{ host: "asafarim.com", origin: "https://asafarim.com", "sec-fetch-site": "same-origin" }, true],
    [{ host: "asafarim.com" }, true],
    [{ host: "asafarim.com", origin: "https://evil.example" }, false],
    [{ host: "asafarim.com", "sec-fetch-site": "cross-site" }, false],
    [{ host: "asafarim.com", "sec-fetch-site": "same-site", origin: "https://hub.asafarim.com" }, false],
    [{ host: "asafarim.com", origin: "null" }, false],
  ])("isSameOrigin(%j) → %s", (headers, expected) => {
    expect(isSameOrigin(req(headers))).toBe(expected);
  });

  it("refuses bodies over the cap without buffering them", async () => {
    const big = new Request("https://x/", { method: "POST", body: "x".repeat(70_000) });
    expect(await readBodyLimited(big, 64_000)).toBeNull();
    const declared = new Request("https://x/", { method: "POST", body: "{}", headers: { "content-length": "999999" } });
    expect(await readBodyLimited(declared, 64_000)).toBeNull();
    expect(await readBodyLimited(new Request("https://x/", { method: "POST", body: '{"a":1}' }), 64_000)).toBe('{"a":1}');
  });
});
