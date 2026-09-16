import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyProfile } from "../../profile/contract";
import { buildDegradedMatchResult, matchResultSchema, type MatchResult } from "../contract";
import { EvaluationProviderError } from "./evaluateProvider";

/**
 * JM-043 pipeline unit tests, with every I/O boundary (db, env, quota,
 * matchRunCache, the provider registry) mocked so the pipeline's own
 * control flow — cache lookup, budget check, retry/degrade, the schema
 * guard, what gets persisted — is exercised without a database.
 * evaluate.integration.test.ts covers the same pipeline against a real
 * database with the real fixture provider.
 */

const mockGetVersion = vi.fn();
vi.mock("../../profile/versions", () => ({
  getVersion: (...args: unknown[]) => mockGetVersion(...args),
}));

const mockJobPostingFindUnique = vi.fn();
vi.mock("../../db/client", () => ({
  getJobmatchDb: () => ({
    jobPosting: { findUnique: (...args: unknown[]) => mockJobPostingFindUnique(...args) },
  }),
}));

const mockGetEnv = vi.fn();
vi.mock("../../env", () => ({
  getEnv: (...args: unknown[]) => mockGetEnv(...args),
}));

vi.mock("../../observability/logger", () => ({
  logError: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockGetCachedMatchRun = vi.fn();
const mockRecordMatchRun = vi.fn();
vi.mock("./matchRunCache", () => ({
  getCachedMatchRun: (...args: unknown[]) => mockGetCachedMatchRun(...args),
  recordMatchRun: (...args: unknown[]) => mockRecordMatchRun(...args),
}));

const mockAssertCanRunProviderCall = vi.fn();
const mockRecordUsage = vi.fn();
class MockQuotaExceededError extends Error {
  reason = "budget";
  budgetUsd = 0;
  monthUsd = 0;
}
vi.mock("./quota", () => ({
  assertCanRunProviderCall: (...args: unknown[]) => mockAssertCanRunProviderCall(...args),
  recordUsage: (...args: unknown[]) => mockRecordUsage(...args),
  QuotaExceededError: MockQuotaExceededError,
}));

const mockGenerate = vi.fn();
vi.mock("./registry", () => ({
  EVALUATION_MODEL_VERSIONS: { fixture: "fixture-eval-1", openai: "x", anthropic: "y" },
  EVALUATION_PROMPT_VERSION: "match_evaluate@1",
  getEvaluationProvider: vi.fn(async () => ({ name: "fixture", generate: mockGenerate })),
}));

const { evaluateMatch } = await import("./evaluate");

function validMatchResult(overrides: Partial<MatchResult> = {}): MatchResult {
  return matchResultSchema.parse({
    suitabilityScore: 0.8,
    confidence: 0.7,
    matchingSkills: ["TypeScript"],
    missingSkills: [],
    uncertainRequirements: [],
    explanation: [{ profileField: "skills[0].name", postingRequirement: "TypeScript", note: "Direct match." }],
    recommendedAction: "worth_applying",
    embeddingModelVersion: null,
    evaluationModelVersion: "fixture-eval-1",
    promptVersion: "match_evaluate@1",
    degraded: false,
    ...overrides,
  });
}

const WORKSPACE_ID = "ws-1";
const PROFILE_VERSION_ID = "pv-1";
const POSTING_ID = "posting-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetEnv.mockReturnValue({ aiEvalProvider: "fixture" });
  mockGetVersion.mockResolvedValue({
    id: PROFILE_VERSION_ID,
    content: { ...emptyProfile(), headline: "Backend Engineer", summary: "Builds APIs." },
  });
  mockJobPostingFindUnique.mockResolvedValue({ description: "Looking for a backend engineer." });
  mockGetCachedMatchRun.mockResolvedValue(null);
  mockAssertCanRunProviderCall.mockResolvedValue(undefined);
  mockRecordMatchRun.mockResolvedValue(undefined);
  mockRecordUsage.mockResolvedValue(undefined);
});

describe("evaluateMatch — cache", () => {
  it("returns the cached result and makes zero provider calls on a cache hit", async () => {
    const cached = validMatchResult({ suitabilityScore: 0.42 });
    mockGetCachedMatchRun.mockResolvedValue(cached);

    const result = await evaluateMatch(WORKSPACE_ID, PROFILE_VERSION_ID, POSTING_ID);

    expect(result).toEqual(cached);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockAssertCanRunProviderCall).not.toHaveBeenCalled();
    expect(mockRecordMatchRun).not.toHaveBeenCalled();
  });
});

describe("evaluateMatch — schema guard vs. degraded mode", () => {
  it("a schema-invalid provider response throws and writes NO MatchRun", async () => {
    mockGenerate.mockResolvedValue({
      result: { garbage: true, not: "a match result" },
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0,
    });

    await expect(evaluateMatch(WORKSPACE_ID, PROFILE_VERSION_ID, POSTING_ID)).rejects.toThrow();
    expect(mockRecordMatchRun).not.toHaveBeenCalled();
  });

  it("retries exhausted on a retryable provider error degrades instead of throwing, and DOES persist the degraded result", async () => {
    mockGenerate.mockRejectedValue(new EvaluationProviderError("boom", true));

    const result = await evaluateMatch(WORKSPACE_ID, PROFILE_VERSION_ID, POSTING_ID);

    expect(result.degraded).toBe(true);
    expect(result).toEqual(buildDegradedMatchResult("match_evaluate@1"));
    expect(mockGenerate).toHaveBeenCalledTimes(3);
    expect(mockRecordMatchRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ degraded: true }), 0);
  });

  it("a non-retryable provider error degrades immediately without exhausting all attempts", async () => {
    mockGenerate.mockRejectedValue(new EvaluationProviderError("bad request", false));

    const result = await evaluateMatch(WORKSPACE_ID, PROFILE_VERSION_ID, POSTING_ID);

    expect(result.degraded).toBe(true);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it("a valid provider response is persisted as a non-degraded MatchRun", async () => {
    const valid = validMatchResult();
    mockGenerate.mockResolvedValue({ result: valid, inputTokens: 10, outputTokens: 10, costUsd: 0.001 });

    const result = await evaluateMatch(WORKSPACE_ID, PROFILE_VERSION_ID, POSTING_ID);

    expect(result).toEqual(valid);
    expect(mockRecordMatchRun).toHaveBeenCalledWith(expect.anything(), valid, 0.001);
  });
});

describe("evaluateMatch — budget exhaustion", () => {
  it("degrades honestly and never throws when the budget is exhausted", async () => {
    mockAssertCanRunProviderCall.mockRejectedValue(new MockQuotaExceededError());

    const result = await evaluateMatch(WORKSPACE_ID, PROFILE_VERSION_ID, POSTING_ID);

    expect(result.degraded).toBe(true);
    expect(result.confidence).toBe(0);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockRecordMatchRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ degraded: true }), 0);
  });
});

describe("evaluateMatch — input boundary", () => {
  it("passes buildEmbeddingInput output, never raw profile fields, to the provider", async () => {
    mockGetVersion.mockResolvedValue({
      id: PROFILE_VERSION_ID,
      content: {
        ...emptyProfile(),
        fullName: "Jordan Example",
        email: "jordan@example.test",
        headline: "Backend Engineer",
      },
    });
    mockGenerate.mockResolvedValue({ result: validMatchResult(), inputTokens: 1, outputTokens: 1, costUsd: 0 });

    await evaluateMatch(WORKSPACE_ID, PROFILE_VERSION_ID, POSTING_ID);

    const call = mockGenerate.mock.calls[0][0];
    expect(call.profileText).not.toContain("Jordan Example");
    expect(call.profileText).not.toContain("jordan@example.test");
    expect(call.profileText).toContain("Backend Engineer");
  });
});
