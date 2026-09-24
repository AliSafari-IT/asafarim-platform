import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuotaExceededError } from "../../tailoring/ai/quota";
import { ExtractionProviderError } from "./provider";

/**
 * Unit coverage for extractProfileWithFallback's degrade paths (issue
 * #421), mocking every DB-touching dependency (quota, the provider
 * registry) so these run under `pnpm test` — no RESUMATCH_TEST_DATABASE_URL
 * needed. degraded.integration.test.ts covers the same behavior end-to-end
 * against a real database; this file exists so the safety property itself
 * (never blocks on a provider outage; a call that never got a response is
 * never ledgered, while a billed response that fails validation is — as a
 * `failed` cost event, issue #586) is
 * exhausted somewhere `pnpm test` actually runs.
 */

const assertCanRunProviderCall = vi.fn();
const recordUsage = vi.fn();
const getExtractionProvider = vi.fn();

vi.mock("../../tailoring/ai/quota", async () => {
  const actual = await vi.importActual<typeof import("../../tailoring/ai/quota")>("../../tailoring/ai/quota");
  return {
    ...actual,
    assertCanRunProviderCall: (...args: unknown[]) => assertCanRunProviderCall(...args),
    recordUsage: (...args: unknown[]) => recordUsage(...args),
    // Same contract as the real settleProviderCall (issue #586), routed
    // through the recordUsage mock so assertions see every ledger write.
    settleProviderCall: async <T,>(usage: Record<string, unknown>, validate: () => T): Promise<T> => {
      let result: T;
      try {
        result = validate();
      } catch (err) {
        await recordUsage({ ...usage, outcome: "failed" });
        throw err;
      }
      await recordUsage({ ...usage, outcome: "succeeded" });
      return result;
    },
    recordBilledFailure: async () => {},
  };
});

vi.mock("./registry", () => ({
  EXTRACT_MODEL_VERSIONS: { fixture: "fixture-extract-1", openai: "gpt-4o-mini", anthropic: "anthropic-extract-unconfigured" },
  getExtractionProvider: (...args: unknown[]) => getExtractionProvider(...args),
}));

const { extractProfileWithFallback } = await import("./degraded");

const SAMPLE_CV = "Jane Doe\njane@example.test";

describe("extractProfileWithFallback — degrade paths", () => {
  beforeEach(() => {
    assertCanRunProviderCall.mockReset().mockResolvedValue(undefined);
    recordUsage.mockReset().mockResolvedValue(undefined);
    getExtractionProvider.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("degrades to the deterministic extractor when the provider throws, without retrying a non-retryable error", async () => {
    const extract = vi.fn().mockRejectedValue(new ExtractionProviderError("no API key", false));
    getExtractionProvider.mockResolvedValue({ name: "openai", extract });

    const result = await extractProfileWithFallback("ws_1", SAMPLE_CV, { provider: "openai" });

    expect(result.degraded).toBe(true);
    expect(result.extractorName).toBe("resumatch-rules");
    expect(extract).toHaveBeenCalledTimes(1); // not retried: retryable === false
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("retries a retryable provider error up to the attempt limit, then degrades", async () => {
    const extract = vi.fn().mockRejectedValue(new ExtractionProviderError("rate limited", true));
    getExtractionProvider.mockResolvedValue({ name: "openai", extract });

    const result = await extractProfileWithFallback("ws_1", SAMPLE_CV, { provider: "openai" });

    expect(result.degraded).toBe(true);
    expect(extract).toHaveBeenCalledTimes(3); // MAX_ATTEMPTS
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("degrades without attempting a provider call when the monthly budget is exhausted", async () => {
    assertCanRunProviderCall.mockRejectedValue(new QuotaExceededError("budget reached", 20, 20));
    const extract = vi.fn();
    getExtractionProvider.mockResolvedValue({ name: "openai", extract });

    const result = await extractProfileWithFallback("ws_1", SAMPLE_CV, { provider: "openai" });

    expect(result.degraded).toBe(true);
    expect(extract).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("degrades when the provider's response fails schema validation, without retrying it", async () => {
    const extract = vi.fn().mockResolvedValue({
      data: { age: 46 }, // an unknown/protected-attribute-shaped top-level key
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });
    getExtractionProvider.mockResolvedValue({ name: "openai", extract });

    const result = await extractProfileWithFallback("ws_1", SAMPLE_CV, { provider: "openai" });

    expect(result.degraded).toBe(true);
    expect(extract).toHaveBeenCalledTimes(1); // schema failures are never retried
    // The provider billed this response even though it was unusable, so it
    // is recorded once, as a failed call (issue #586) — not dropped.
    expect(recordUsage).toHaveBeenCalledTimes(1);
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({ kind: "extract", outcome: "failed" }));
  });

  it("records ledger usage and returns a non-degraded result on a successful, valid call", async () => {
    const extract = vi.fn().mockResolvedValue({
      data: { fullName: "Jane Doe" },
      inputTokens: 100,
      outputTokens: 20,
      costUsd: 0.002,
    });
    getExtractionProvider.mockResolvedValue({ name: "openai", extract });

    const result = await extractProfileWithFallback("ws_1", SAMPLE_CV, { provider: "openai" });

    expect(result.degraded).toBe(false);
    expect(result.content.fullName).toBe("Jane Doe");
    expect(recordUsage).toHaveBeenCalledTimes(1);
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "ws_1", kind: "extract" }));
  });
});
