import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyProfile } from "../../profile/contract";
import { TailorProviderError } from "./provider";

/**
 * Issue #511 for the tailor call: when the fallback provider serves the
 * call, the result names the fallback's provider and model, since the
 * preview route stores `modelVersion` as the run's provenance.
 */

const recordUsage = vi.fn();
const getTailorProvider = vi.fn();

vi.mock("../../env", () => ({
  getEnv: () => ({ aiProvider: "openai", aiFallbackProvider: "anthropic" }),
}));
vi.mock("../../db/client", () => ({
  getJobmatchDb: () => ({ aiCallOutcome: { create: async () => ({}) } }),
}));
vi.mock("../../profile/versions", () => ({ getVersion: async () => null }));
vi.mock("./quota", () => ({
  assertCanRunProviderCall: async () => undefined,
  recordUsage: (...args: unknown[]) => recordUsage(...args),
  recordBilledFailure: async () => undefined,
}));
vi.mock("./registry", async () => ({
  TAILOR_PROMPT_VERSION: (
    await vi.importActual<typeof import("./registry")>("./registry")
  ).TAILOR_PROMPT_VERSION,
  getTailorProvider: (...args: unknown[]) => getTailorProvider(...args),
  resolveTailorModelVersion: async (name: string) => `${name}-model`,
}));

const { runTailorProviderCall } = await import("./generate");

const okOutput = {
  suggestions: { summary: null },
  inputTokens: 10,
  outputTokens: 5,
  costUsd: 0.001,
};

describe("runTailorProviderCall — cross-provider fallback (issue #511)", () => {
  beforeEach(() => {
    recordUsage.mockReset().mockResolvedValue(undefined);
    getTailorProvider.mockReset();
  });

  it("reports and ledgers the fallback provider and model when the fallback serves the call", async () => {
    const openaiGenerate = vi
      .fn()
      .mockRejectedValue(new TailorProviderError("overloaded", true));
    const anthropicGenerate = vi.fn().mockResolvedValue(okOutput);
    getTailorProvider.mockImplementation(async (name: string) => ({
      name,
      generate: name === "anthropic" ? anthropicGenerate : openaiGenerate,
    }));

    const result = await runTailorProviderCall(
      "ws_1",
      "job_1",
      emptyProfile(),
      "A job"
    );

    expect(result.degraded).toBe(false);
    expect(result.providerName).toBe("anthropic");
    expect(result.modelVersion).toBe("anthropic-model");
    expect(openaiGenerate).toHaveBeenCalledTimes(3);
    expect(anthropicGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "anthropic-model" })
    );
    expect(recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "tailor",
        provider: "anthropic",
        model: "anthropic-model",
      })
    );
  });

  it("reports the primary when the call degrades", async () => {
    const generate = vi
      .fn()
      .mockRejectedValue(new TailorProviderError("bad request", false));
    getTailorProvider.mockResolvedValue({ name: "openai", generate });

    const result = await runTailorProviderCall(
      "ws_1",
      "job_1",
      emptyProfile(),
      "A job"
    );

    expect(result.degraded).toBe(true);
    expect(result.providerName).toBe("openai");
    expect(result.modelVersion).toBe("openai-model");
    expect(getTailorProvider).not.toHaveBeenCalledWith("anthropic");
  });

  it("never calls the fallback when the primary answered but recording its spend failed", async () => {
    recordUsage.mockRejectedValue(new Error("ledger down"));
    const openaiGenerate = vi.fn().mockResolvedValue(okOutput);
    const anthropicGenerate = vi.fn().mockResolvedValue(okOutput);
    getTailorProvider.mockImplementation(async (name: string) => ({
      name,
      generate: name === "anthropic" ? anthropicGenerate : openaiGenerate,
    }));

    const result = await runTailorProviderCall(
      "ws_1",
      "job_1",
      emptyProfile(),
      "A job"
    );

    expect(result.degraded).toBe(true);
    expect(openaiGenerate).toHaveBeenCalledTimes(3);
    expect(anthropicGenerate).not.toHaveBeenCalled();
  });
});
