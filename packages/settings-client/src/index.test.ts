import { describe, expect, it, vi } from "vitest";
import { createSettingsClient, type SettingsWireResponse } from "./index";

function respond(body: SettingsWireResponse, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

const payload: SettingsWireResponse = {
  scope: "resumatch",
  settings: [
    { key: "resumatch.aiMonthlyBudgetUsd", scope: "resumatch", type: "number", overridden: true, value: 50 },
    { key: "maintenance.enabled", scope: "platform", type: "boolean", overridden: false, value: false },
    { key: "ai.openaiApiKey", scope: "platform", type: "secret", overridden: true, isSet: true },
  ],
};

function setup(fetchImpl: ReturnType<typeof vi.fn>, extra: { now?: () => number; secret?: string } = {}) {
  return createSettingsClient({
    baseUrl: "https://admin.example.test",
    secret: "secret" in extra ? extra.secret : "s3cret",
    scope: "resumatch",
    fetch: fetchImpl as unknown as typeof fetch,
    now: extra.now,
  });
}

describe("createSettingsClient", () => {
  it("returns an admin override and sends the scope + bearer", async () => {
    const fetchImpl = vi.fn(async (_url: URL, _init?: RequestInit) => respond(payload));
    const client = setup(fetchImpl);

    expect(await client.getSetting("resumatch.aiMonthlyBudgetUsd", 20)).toBe(50);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://admin.example.test/api/internal/settings?scope=resumatch");
    expect(init?.headers).toEqual({ authorization: "Bearer s3cret" });
  });

  it("returns the caller's fallback, not the catalog default, when nothing is overridden", async () => {
    const client = setup(vi.fn(async () => respond(payload)));
    // Catalog default is false; the caller's own fallback wins because no admin set it.
    expect(await client.getSetting("maintenance.enabled", true)).toBe(true);
  });

  it("never yields a secret — only its fallback", async () => {
    const client = setup(vi.fn(async () => respond(payload)));
    expect(await client.getSetting("ai.openaiApiKey", "from-env")).toBe("from-env");
  });

  it("falls back on an unknown key or a type mismatch", async () => {
    const client = setup(vi.fn(async () => respond(payload)));
    expect(await client.getSetting("no.such.key", 7)).toBe(7);
    expect(await client.getSetting("resumatch.aiMonthlyBudgetUsd", "not-a-number")).toBe("not-a-number");
  });

  it("reuses one snapshot within the TTL and refreshes after it", async () => {
    let t = 0;
    const fetchImpl = vi.fn(async () => respond(payload));
    const client = setup(fetchImpl, { now: () => t });

    await client.getSetting("resumatch.aiMonthlyBudgetUsd", 20);
    await client.getSetting("maintenance.enabled", false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    t = 60_001;
    await client.getSetting("resumatch.aiMonthlyBudgetUsd", 20);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight request between concurrent callers", async () => {
    const fetchImpl = vi.fn(async () => respond(payload));
    const client = setup(fetchImpl);
    await Promise.all([
      client.getSetting("resumatch.aiMonthlyBudgetUsd", 20),
      client.getSetting("maintenance.enabled", false),
      client.getSetting("no.such.key", 1),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("degrades to the fallback, without throwing, when the API is down", async () => {
    const client = setup(vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    await expect(client.getSetting("resumatch.aiMonthlyBudgetUsd", 20)).resolves.toBe(20);
  });

  it("degrades to the fallback on a non-2xx (e.g. wrong secret -> 404)", async () => {
    const client = setup(vi.fn(async () => new Response("Not found", { status: 404 })));
    expect(await client.getSetting("resumatch.aiMonthlyBudgetUsd", 20)).toBe(20);
  });

  it("keeps serving the last good value when a later refresh fails", async () => {
    let t = 0;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(respond(payload))
      .mockRejectedValue(new Error("down"));
    const client = setup(fetchImpl, { now: () => t });

    expect(await client.getSetting("resumatch.aiMonthlyBudgetUsd", 20)).toBe(50);
    t = 60_001;
    expect(await client.getSetting("resumatch.aiMonthlyBudgetUsd", 20)).toBe(50);
  });

  it("backs off for a full TTL after a failure instead of retrying every call", async () => {
    let t = 0;
    const fetchImpl = vi.fn(async () => { throw new Error("down"); });
    const client = setup(fetchImpl, { now: () => t });

    await client.getSetting("resumatch.aiMonthlyBudgetUsd", 20);
    await client.getSetting("resumatch.aiMonthlyBudgetUsd", 20);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    t = 60_001;
    await client.getSetting("resumatch.aiMonthlyBudgetUsd", 20);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("never calls the API without a secret, and falls back", async () => {
    const fetchImpl = vi.fn(async () => respond(payload));
    const client = setup(fetchImpl, { secret: undefined });
    expect(await client.getSetting("resumatch.aiMonthlyBudgetUsd", 20)).toBe(20);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
