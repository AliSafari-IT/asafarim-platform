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
const { clearDedupCacheForTests } = await import("../../shared/aiDedupCache");

const URL = "https://example.test/jobs/1";

describe("fetchJobWithFallback — degrade paths", () => {
  beforeEach(() => {
    assertCanRunProviderCall.mockReset().mockResolvedValue(undefined);
    recordUsage.mockReset().mockResolvedValue(undefined);
    getJobFetchProvider.mockReset();
    clearDedupCacheForTests();
    // Tier 1 can't read the page, so these tests exercise the AI tier.
    fetchJobPosting.mockReset().mockResolvedValue({ ok: false, reasonCode: "NO_READABLE_TEXT" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses a disallowed URL before touching any provider", async () => {
    const result = await fetchJobWithFallback("ws_1", "http://internal.example/jobs/1", { provider: "openai", escalate: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe("URL_NOT_ALLOWED");
    expect(assertCanRunProviderCall).not.toHaveBeenCalled();
  });

  it("uses the raw fetch directly with the fixture provider — no budget check, no ledger write", async () => {
    fetchJobPosting.mockResolvedValue({ ok: true, rawText: "Fallback raw text.", title: "Fallback Title", employer: null });
    const result = await fetchJobWithFallback("ws_1", URL, { provider: "fixture" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.degraded).toBe(true);
    expect(assertCanRunProviderCall).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("degrades to the tier-1 result when the real provider throws a non-retryable error", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new JobFetchProviderError("no API key", false));
    getJobFetchProvider.mockResolvedValue({ name: "openai", fetch: fetchFn });

    const result = await fetchJobWithFallback("ws_1", URL, { provider: "openai", escalate: true });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, reasonCode: "NO_READABLE_TEXT", degraded: true });
    // The page is fetched once, not again on the way out.
    expect(fetchJobPosting).toHaveBeenCalledTimes(1);
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("degrades without attempting a provider call once the budget is exhausted", async () => {
    assertCanRunProviderCall.mockRejectedValue(new QuotaExceededError("budget reached", 20, 20));
    const fetchFn = vi.fn();
    getJobFetchProvider.mockResolvedValue({ name: "openai", fetch: fetchFn });

    const result = await fetchJobWithFallback("ws_1", URL, { provider: "openai", escalate: true });

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, reasonCode: "NO_READABLE_TEXT", degraded: true });
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

    const result = await fetchJobWithFallback("ws_1", URL, { provider: "openai", escalate: true });

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

describe("fetchJobWithFallback — short-TTL dedup (issue #513)", () => {
  const okOutput = {
    title: "Implementation Analyst",
    employer: "Kingfisher IT",
    rawText: "Real job description text read by the model.",
    inputTokens: 500,
    outputTokens: 100,
    costUsd: 0.001,
  };

  beforeEach(() => {
    assertCanRunProviderCall.mockReset().mockResolvedValue(undefined);
    recordUsage.mockReset().mockResolvedValue(undefined);
    getJobFetchProvider.mockReset();
    fetchJobPosting.mockReset().mockResolvedValue({ ok: false, reasonCode: "NO_READABLE_TEXT" });
    clearDedupCacheForTests();
  });

  it("reuses the result for the same URL within the TTL: one provider call, one ledger row", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okOutput);
    getJobFetchProvider.mockResolvedValue({ name: "openai", fetch: fetchFn });

    const first = await fetchJobWithFallback("ws_1", URL, { provider: "openai", escalate: true });
    const second = await fetchJobWithFallback("ws_1", URL, { provider: "openai", escalate: true });

    expect(second).toEqual(first);
    expect(second.degraded).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(recordUsage).toHaveBeenCalledTimes(1);
    expect(assertCanRunProviderCall).toHaveBeenCalledTimes(1);
  });

  it("fetches a different URL fresh", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okOutput);
    getJobFetchProvider.mockResolvedValue({ name: "openai", fetch: fetchFn });

    await fetchJobWithFallback("ws_1", URL, { provider: "openai", escalate: true });
    await fetchJobWithFallback("ws_1", "https://example.test/jobs/2", { provider: "openai", escalate: true });

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("does not cache a degraded raw-fetch result: a retry after a failure calls the provider again", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new JobFetchProviderError("no API key", false))
      .mockResolvedValueOnce(okOutput);
    getJobFetchProvider.mockResolvedValue({ name: "openai", fetch: fetchFn });

    const first = await fetchJobWithFallback("ws_1", URL, { provider: "openai", escalate: true });
    const second = await fetchJobWithFallback("ws_1", URL, { provider: "openai", escalate: true });

    expect(first.degraded).toBe(true);
    expect(second.degraded).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe("fetchJobWithFallback — tiered strategy (issue #517)", () => {
  const okOutput = {
    title: "Implementation Analyst",
    employer: "Kingfisher IT",
    rawText: "Real job description text read by the model.",
    inputTokens: 500,
    outputTokens: 100,
    costUsd: 0.001,
  };
  const serverRendered = { ok: true, rawText: "Server-rendered job description.", title: "Data Engineer", employer: "Acme" };
  let fetchFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    assertCanRunProviderCall.mockReset().mockResolvedValue(undefined);
    recordUsage.mockReset().mockResolvedValue(undefined);
    fetchFn = vi.fn().mockResolvedValue(okOutput);
    getJobFetchProvider.mockReset().mockResolvedValue({ name: "openai", fetch: fetchFn });
    fetchJobPosting.mockReset();
    clearDedupCacheForTests();
  });

  it("returns a page the deterministic fetch reads without any AI call, quota check or ledger row", async () => {
    fetchJobPosting.mockResolvedValue(serverRendered);

    const result = await fetchJobWithFallback("ws_1", URL, { provider: "openai", escalate: true });

    expect(result).toEqual({ ...serverRendered, degraded: false });
    expect(fetchJobPosting).toHaveBeenCalledTimes(1);
    expect(getJobFetchProvider).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(assertCanRunProviderCall).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it.each(["NO_READABLE_TEXT", "BOT_BLOCKED", "HTTP_ERROR", "TIMEOUT", "NETWORK_ERROR", "REDIRECT_REFUSED", "RESPONSE_TOO_LARGE"] as const)(
    "escalates to the AI tier when the deterministic fetch fails with %s",
    async (reasonCode) => {
      fetchJobPosting.mockResolvedValue({ ok: false, reasonCode });

      const result = await fetchJobWithFallback("ws_1", URL, { provider: "openai", escalate: true });

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(recordUsage).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.degraded).toBe(false);
        expect(result.title).toBe("Implementation Analyst");
      }
    },
  );

  it("never hands a URL the deterministic tier refuses as not allowed to the AI tier", async () => {
    const { shouldEscalate } = await import("./degraded");
    expect(shouldEscalate("URL_NOT_ALLOWED")).toBe(false);

    const result = await fetchJobWithFallback("ws_1", "https://localhost/jobs/1", { provider: "openai", escalate: true });

    expect(result).toEqual({ ok: false, reasonCode: "URL_NOT_ALLOWED" });
    expect(fetchJobPosting).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("stays deterministic-only when escalation is turned off", async () => {
    fetchJobPosting.mockResolvedValue({ ok: false, reasonCode: "NO_READABLE_TEXT" });

    const result = await fetchJobWithFallback("ws_1", URL, { provider: "openai", escalate: false });

    expect(result).toEqual({ ok: false, reasonCode: "NO_READABLE_TEXT", degraded: true });
    expect(getJobFetchProvider).not.toHaveBeenCalled();
    expect(assertCanRunProviderCall).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("keeps the fixture provider deterministic-only even with escalation on", async () => {
    fetchJobPosting.mockResolvedValue({ ok: false, reasonCode: "NO_READABLE_TEXT" });

    const result = await fetchJobWithFallback("ws_1", URL, { provider: "fixture", escalate: true });

    expect(result).toEqual({ ok: false, reasonCode: "NO_READABLE_TEXT", degraded: true });
    expect(getJobFetchProvider).not.toHaveBeenCalled();
  });
});
