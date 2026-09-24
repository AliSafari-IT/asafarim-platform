import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuotaExceededError } from "../ai/quota";
import { JobFetchProviderError } from "./provider";

/**
 * Unit coverage for fetchJobWithFallback's degrade paths, mirroring
 * lib/extraction/ai/degraded.test.ts: mocks quota and the provider
 * registry so this runs under `pnpm test` without a database, and mocks
 * the raw fetch fallback so a real network call is never made.
 */

const assertCanRunProviderCall = vi.fn();
const recordUsage = vi.fn();
const getJobFetchProvider = vi.fn();
const fetchJobPosting = vi.fn();

vi.mock("../ai/quota", async () => {
  const actual = await vi.importActual<typeof import("../ai/quota")>("../ai/quota");
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
  FETCH_JOB_MODEL_VERSIONS: { fixture: "fixture-fetch-job-1", openai: "gpt-4o-mini", anthropic: "anthropic-fetch-job-unconfigured" },
  getJobFetchProvider: (...args: unknown[]) => getJobFetchProvider(...args),
}));

vi.mock("../fetchJob", async () => {
  const actual = await vi.importActual<typeof import("../fetchJob")>("../fetchJob");
  return {
    ...actual,
    fetchJobPosting: (...args: unknown[]) => fetchJobPosting(...args),
  };
});

const { fetchJobWithFallback } = await import("./degraded");

const URL = "https://example.test/jobs/1";

describe("fetchJobWithFallback — degrade paths", () => {
  beforeEach(() => {
    assertCanRunProviderCall.mockReset().mockResolvedValue(undefined);
    recordUsage.mockReset().mockResolvedValue(undefined);
    getJobFetchProvider.mockReset();
    fetchJobPosting.mockReset().mockResolvedValue({
      ok: true,
      rawText: "Fallback raw text.",
      title: "Fallback Title",
      employer: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses a disallowed URL before touching any provider", async () => {
    const result = await fetchJobWithFallback("ws_1", "http://internal.example/jobs/1", { provider: "openai" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe("URL_NOT_ALLOWED");
    expect(assertCanRunProviderCall).not.toHaveBeenCalled();
  });

  it("uses the raw fetch directly with the fixture provider — no budget check, no ledger write", async () => {
    const result = await fetchJobWithFallback("ws_1", URL, { provider: "fixture" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.degraded).toBe(true);
    expect(assertCanRunProviderCall).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("degrades to the raw fetch when the real provider throws a non-retryable error", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new JobFetchProviderError("no API key", false));
    getJobFetchProvider.mockResolvedValue({ name: "openai", fetch: fetchFn });

    const result = await fetchJobWithFallback("ws_1", URL, { provider: "openai" });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.degraded).toBe(true);
      expect(result.title).toBe("Fallback Title");
    }
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("degrades without attempting a provider call once the budget is exhausted", async () => {
    assertCanRunProviderCall.mockRejectedValue(new QuotaExceededError("budget reached", 20, 20));
    const fetchFn = vi.fn();
    getJobFetchProvider.mockResolvedValue({ name: "openai", fetch: fetchFn });

    const result = await fetchJobWithFallback("ws_1", URL, { provider: "openai" });

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.degraded).toBe(true);
  });

  it("records usage and returns a non-degraded result on a successful, valid call", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      title: "Implementation Analyst",
      employer: "Kingfisher IT",
      rawText: "Real job description text read by the model.",
      inputTokens: 500,
      outputTokens: 100,
      costUsd: 0.001,
    });
    getJobFetchProvider.mockResolvedValue({ name: "openai", fetch: fetchFn });

    const result = await fetchJobWithFallback("ws_1", URL, { provider: "openai" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.degraded).toBe(false);
      expect(result.title).toBe("Implementation Analyst");
      expect(result.rawText).toContain("Real job description");
    }
    expect(recordUsage).toHaveBeenCalledTimes(1);
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "ws_1", kind: "fetch_job" }));
  });
});
