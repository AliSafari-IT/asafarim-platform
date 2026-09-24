import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../platform-settings", () => ({
  getPlatformSetting: vi.fn(),
}));

import { getPlatformSetting } from "../../platform-settings";
import { resolveTailorModelVersion, TAILOR_MODEL_VERSIONS } from "./registry";

const savedEnv = { ...process.env };

beforeEach(() => {
  vi.mocked(getPlatformSetting).mockReset();
});
afterEach(() => {
  process.env = { ...savedEnv };
});

describe("resolveTailorModelVersion", () => {
  it("fixture has no settings override — always the fixed test-double model", async () => {
    expect(await resolveTailorModelVersion("fixture")).toBe("fixture-tailor-1");
    expect(getPlatformSetting).not.toHaveBeenCalled();
  });

  it("openai: asks the settings client with the env-derived value as fallback", async () => {
    vi.mocked(getPlatformSetting).mockResolvedValue(TAILOR_MODEL_VERSIONS.openai);
    const result = await resolveTailorModelVersion("openai");
    expect(getPlatformSetting).toHaveBeenCalledWith(
      "resumatch.ai.openaiModel",
      TAILOR_MODEL_VERSIONS.openai,
    );
    expect(result).toBe(TAILOR_MODEL_VERSIONS.openai);
  });

  it("anthropic: asks the settings client with the env-derived value as fallback", async () => {
    vi.mocked(getPlatformSetting).mockResolvedValue(TAILOR_MODEL_VERSIONS.anthropic);
    await resolveTailorModelVersion("anthropic");
    expect(getPlatformSetting).toHaveBeenCalledWith(
      "resumatch.ai.anthropicModel",
      TAILOR_MODEL_VERSIONS.anthropic,
    );
  });

  it("an admin-console override wins over the env-derived default", async () => {
    vi.mocked(getPlatformSetting).mockResolvedValue("gpt-4.1");
    expect(await resolveTailorModelVersion("openai")).toBe("gpt-4.1");
  });

  it("falls back to the env-derived value when nothing is overridden (client itself falls back)", async () => {
    // @asafarim/settings-client's own contract: no override -> resolves to
    // the fallback it was called with. Simulated here rather than mocked
    // away, so this test would fail if the call site stopped passing one.
    vi.mocked(getPlatformSetting).mockImplementation(async (_key, fallback) => fallback);
    expect(await resolveTailorModelVersion("openai")).toBe(TAILOR_MODEL_VERSIONS.openai);
  });
});
