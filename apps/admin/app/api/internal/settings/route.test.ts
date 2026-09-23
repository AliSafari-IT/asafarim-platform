import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real catalog passes through; only the DB read is replaced, with one
// secret whose decrypted plaintext is present — exactly what
// getEffectiveSettings hands the route in production.
vi.mock("@asafarim/db", async () => {
  const actual = await vi.importActual<typeof import("@asafarim/db")>("@asafarim/db");
  return { ...actual, getEffectiveSettings: vi.fn() };
});

import { getEffectiveSettings, type EffectiveSetting } from "@asafarim/db";
import { GET } from "./route";

const PLAINTEXT = "sk_live_THIS_MUST_NEVER_LEAVE_ADMIN";

function setting(key: string, scope: string, type: string, value: unknown, overridden: boolean): EffectiveSetting {
  return {
    definition: { key, label: key, description: "", group: "operations", scope, type, defaultValue: value } as EffectiveSetting["definition"],
    value: value as EffectiveSetting["value"],
    overridden,
    updatedAt: null,
    updatedBy: null,
    updatedByEmail: null,
  };
}

const EFFECTIVE: EffectiveSetting[] = [
  setting("resumatch.aiMonthlyBudgetUsd", "resumatch", "number", 50, true),
  setting("maintenance.enabled", "platform", "boolean", false, false),
  setting("testora.someFlag", "testora", "boolean", true, true),
  setting("ai.openaiApiKey", "platform", "secret", PLAINTEXT, true),
];

function request(path: string, token?: string) {
  return new Request(`https://admin.test${path}`, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

beforeEach(() => {
  process.env.INTERNAL_API_SECRET = "internal-secret";
  vi.mocked(getEffectiveSettings).mockReset().mockResolvedValue(EFFECTIVE);
});
afterEach(() => {
  delete process.env.INTERNAL_API_SECRET;
});

describe("GET /api/internal/settings — authentication", () => {
  it("404s without a bearer token", async () => {
    expect((await GET(request("/api/internal/settings?scope=resumatch"))).status).toBe(404);
  });

  it("404s with the wrong token", async () => {
    expect((await GET(request("/api/internal/settings", "nope"))).status).toBe(404);
  });

  it("404s when INTERNAL_API_SECRET is unset, even for an empty bearer", async () => {
    delete process.env.INTERNAL_API_SECRET;
    expect((await GET(request("/api/internal/settings", ""))).status).toBe(404);
  });

  it("never touches the database for an unauthorized caller", async () => {
    await GET(request("/api/internal/settings", "nope"));
    expect(getEffectiveSettings).not.toHaveBeenCalled();
  });
});

describe("GET /api/internal/settings — payload", () => {
  it("returns the requested scope plus platform settings only", async () => {
    const res = await GET(request("/api/internal/settings?scope=resumatch", "internal-secret"));
    const body = (await res.json()) as { settings: { key: string }[] };
    expect(res.status).toBe(200);
    expect(body.settings.map((s) => s.key).sort()).toEqual(
      ["ai.openaiApiKey", "maintenance.enabled", "resumatch.aiMonthlyBudgetUsd"].sort(),
    );
  });

  it("reports override state so clients can prefer their own fallback", async () => {
    const res = await GET(request("/api/internal/settings?scope=resumatch", "internal-secret"));
    const body = (await res.json()) as { settings: { key: string; overridden: boolean; value?: unknown }[] };
    expect(body.settings.find((s) => s.key === "resumatch.aiMonthlyBudgetUsd")).toMatchObject({ overridden: true, value: 50 });
    expect(body.settings.find((s) => s.key === "maintenance.enabled")).toMatchObject({ overridden: false });
  });

  it("never returns secret plaintext — isSet only, and no value field at all", async () => {
    const res = await GET(request("/api/internal/settings", "internal-secret"));
    const raw = await res.text();
    expect(raw).not.toContain(PLAINTEXT);
    const secret = (JSON.parse(raw) as { settings: Record<string, unknown>[] }).settings.find(
      (s) => s.key === "ai.openaiApiKey",
    );
    expect(secret).toEqual({ key: "ai.openaiApiKey", scope: "platform", type: "secret", overridden: true, isSet: true });
  });

  it("is not cacheable by intermediaries", async () => {
    const res = await GET(request("/api/internal/settings", "internal-secret"));
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("400s on a malformed scope", async () => {
    const res = await GET(request("/api/internal/settings?scope=../etc", "internal-secret"));
    expect(res.status).toBe(400);
  });

  it("503s (so clients fall back) when the settings read fails", async () => {
    vi.mocked(getEffectiveSettings).mockRejectedValue(new Error("db down"));
    const res = await GET(request("/api/internal/settings", "internal-secret"));
    expect(res.status).toBe(503);
  });
});
