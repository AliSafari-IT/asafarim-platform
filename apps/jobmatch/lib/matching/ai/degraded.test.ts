import { describe, expect, it, vi } from "vitest";
import { buildDegradedMatchResult, type MatchResult } from "../contract";
import { runOrDegrade } from "./degraded";
import { QuotaExceededError } from "./quota";

vi.mock("../../observability/logger", () => ({
  logError: vi.fn(),
}));

const realResult: MatchResult = {
  contractVersion: "1.0.0",
  suitabilityScore: 0.9,
  confidence: 0.8,
  matchingSkills: [],
  missingSkills: [],
  uncertainRequirements: [],
  explanation: [{ profileField: "skills[0].name", postingRequirement: "TS", note: "match" }],
  recommendedAction: "strong_match",
  embeddingModelVersion: "fixture-1",
  evaluationModelVersion: "fixture-eval-1",
  promptVersion: "match-eval-1",
  degraded: false,
};

describe("runOrDegrade — JM-047 honest degraded mode wiring", () => {
  it("returns the real result unchanged when fn succeeds", async () => {
    const result = await runOrDegrade("match-eval-1", "evaluate", async () => realResult);
    expect(result).toEqual(realResult);
  });

  it("degrades on QuotaExceededError (budget out) instead of throwing", async () => {
    const result = await runOrDegrade("match-eval-1", "evaluate", async () => {
      throw new QuotaExceededError("budget reached", 20, 20);
    });
    expect(result).toEqual(buildDegradedMatchResult("match-eval-1"));
    expect(result.degraded).toBe(true);
  });

  it("degrades on a generic provider failure (retries exhausted / no provider) instead of throwing", async () => {
    const result = await runOrDegrade("match-eval-1", "evaluate", async () => {
      throw new Error("provider unreachable after retries");
    });
    expect(result).toEqual(buildDegradedMatchResult("match-eval-1"));
  });

  it("never fabricates a score — degraded result always has zero confidence and no evidence", async () => {
    const result = await runOrDegrade("match-eval-1", "embed", async () => {
      throw new QuotaExceededError("budget reached", 20, 20);
    });
    expect(result.confidence).toBe(0);
    expect(result.explanation).toHaveLength(0);
    expect(result.embeddingModelVersion).toBeNull();
    expect(result.evaluationModelVersion).toBeNull();
  });
});
