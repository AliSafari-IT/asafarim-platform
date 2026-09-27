import { beforeEach, describe, expect, it, vi } from "vitest";

// No database or provider in unit tests: fixture mode, and a no-op cost sink.
vi.mock("../../../../../lib/tools/server/cost-sink", () => ({ prismaCostEventSink: { record: async () => "evt" } }));
vi.mock("../../../../../lib/tools/server/config", () => ({
  loadRuntimeConfig: async () => ({ mode: "fixture", liveEnabled: false, disabledTools: new Set(), provider: null, notes: [] }),
}));

const SLUG = "notes-to-action-plan";
const input = { notes: "Planning\n- Draft the export feature.\n- Review the copy with the team." };

async function load() {
  vi.resetModules();
  vi.stubEnv("AI_TOOLS_REQUESTS_PER_5_MIN", "3");
  return (await import("./route")).POST;
}

function post(POST: Awaited<ReturnType<typeof load>>, init: { body?: string; headers?: Record<string, string> } = {}) {
  const request = new Request(`https://asafarim.com/api/tools/${SLUG}/run`, {
    method: "POST",
    body: init.body ?? JSON.stringify({ input, mode: "live", idempotencyKey: `route-${Math.random().toString(36).slice(2)}-0000` }),
    headers: { host: "asafarim.com", "content-type": "application/json", "x-forwarded-for": "203.0.113.7", ...init.headers },
  });
  return POST(request, { params: Promise.resolve({ slug: SLUG }) });
}

describe("POST /api/tools/[slug]/run", () => {
  let POST: Awaited<ReturnType<typeof load>>;
  beforeEach(async () => {
    POST = await load();
  });

  it("serves a same-origin JSON request with no-store", async () => {
    const res = await post(POST, { headers: { origin: "https://asafarim.com", "sec-fetch-site": "same-origin" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.json()).mode).toBe("fixture");
  });

  it("refuses cross-site requests and non-JSON bodies (CSRF)", async () => {
    expect((await post(POST, { headers: { origin: "https://evil.example" } })).status).toBe(403);
    expect((await post(POST, { headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    expect((await post(POST, { headers: { "content-type": "text/plain" } })).status).toBe(403);
  });

  it("refuses oversized bodies before parsing", async () => {
    const res = await post(POST, { body: JSON.stringify({ input: { notes: "x".repeat(70_000) }, mode: "live", idempotencyKey: "big-body-00000000" }) });
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("input_too_large");
  });

  it("rate-limits each client with Retry-After and an actionable, no-content error", async () => {
    for (let i = 0; i < 3; i++) expect((await post(POST)).status).toBe(200);
    const res = await post(POST);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    const body = await res.json();
    expect(body.error).toMatchObject({ code: "rate_limited", retryable: true });
    expect(JSON.stringify(body)).not.toContain("Draft the export");
    // Another client is unaffected.
    expect((await post(POST, { headers: { "x-forwarded-for": "198.51.100.4" } })).status).toBe(200);
  });
});
