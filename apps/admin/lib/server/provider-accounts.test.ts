import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@asafarim/db", () => ({
  prisma: { viontoAiClip: { findMany: vi.fn() } },
  getEffectiveSetting: vi.fn(),
}));

import { prisma, getEffectiveSetting } from "@asafarim/db";
import { getProviderAccounts } from "./provider-accounts";

const savedEnv = { ...process.env };

beforeEach(() => {
  vi.mocked(prisma.viontoAiClip.findMany).mockReset().mockResolvedValue([]);
  vi.mocked(getEffectiveSetting).mockReset();
  process.env = { ...savedEnv };
  delete process.env.FAL_KEY;
  delete process.env.KLING_API_KEY;
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
});

async function accountFor(id: string) {
  const accounts = await getProviderAccounts();
  const account = accounts.find((a) => a.meta.id === id);
  if (!account) throw new Error(`no such provider: ${id}`);
  return account;
}

describe("getProviderAccounts — configured", () => {
  it("openai: unconfigured when neither env nor settings has a key", async () => {
    vi.mocked(getEffectiveSetting).mockResolvedValue(undefined);
    const account = await accountFor("openai");
    expect(account.configured).toBe(false);
    expect(account.live).toEqual({ state: "not_configured" });
  });

  it("openai: configured via env var alone", async () => {
    process.env.OPENAI_API_KEY = "sk-env-key";
    vi.mocked(getEffectiveSetting).mockResolvedValue(undefined);
    const account = await accountFor("openai");
    expect(account.configured).toBe(true);
    // liveAccountApi is false for openai, so "configured" never implies "ok".
    expect(account.live).toEqual({ state: "unsupported" });
  });

  it("openai: configured via the settings store alone (no env var)", async () => {
    vi.mocked(getEffectiveSetting).mockImplementation(async (key: string) =>
      key === "ai.openai.apiKey" ? ({ overridden: true } as never) : undefined,
    );
    const account = await accountFor("openai");
    expect(account.configured).toBe(true);
    expect(account.live).toEqual({ state: "unsupported" });
  });

  it("openai: reads settingsKey \"ai.openai.apiKey\", not the wrong key", async () => {
    vi.mocked(getEffectiveSetting).mockResolvedValue(undefined);
    await accountFor("openai");
    expect(getEffectiveSetting).toHaveBeenCalledWith("ai.openai.apiKey");
  });

  it("anthropic: reads settingsKey \"ai.anthropic.apiKey\"", async () => {
    vi.mocked(getEffectiveSetting).mockResolvedValue(undefined);
    await accountFor("anthropic");
    expect(getEffectiveSetting).toHaveBeenCalledWith("ai.anthropic.apiKey");
  });

  it("elevenlabs: has no settingsKey — settings store is never consulted", async () => {
    vi.mocked(getEffectiveSetting).mockResolvedValue(undefined);
    const account = await accountFor("elevenlabs");
    expect(account.configured).toBe(false);
    expect(getEffectiveSetting).not.toHaveBeenCalledWith("elevenlabs", expect.anything());
  });

  it("degrades to \"not configured\" (not a thrown error) when the settings store is unreachable", async () => {
    vi.mocked(getEffectiveSetting).mockRejectedValue(new Error("db down"));
    const account = await accountFor("openai");
    expect(account.configured).toBe(false);
  });

  it("fal/kling stay env-only: a settings row would never even be looked up", async () => {
    vi.mocked(getEffectiveSetting).mockResolvedValue(undefined);
    await getProviderAccounts();
    expect(getEffectiveSetting).not.toHaveBeenCalledWith("fal.apiKey");
    expect(getEffectiveSetting).not.toHaveBeenCalledWith("kling.apiKey");
  });
});
