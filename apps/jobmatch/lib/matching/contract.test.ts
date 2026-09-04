import { describe, expect, it } from "vitest";
import { buildDegradedMatchResult, matchResultSchema, parseMatchResult } from "./contract";

function validResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    suitabilityScore: 0.8,
    confidence: 0.7,
    matchingSkills: ["TypeScript"],
    missingSkills: ["Kubernetes"],
    uncertainRequirements: ["Willingness to travel — not addressed on the CV"],
    explanation: [
      {
        profileField: "skills[0].name",
        postingRequirement: "Strong TypeScript experience",
        note: "The profile lists TypeScript as a skill.",
      },
    ],
    recommendedAction: "worth_applying",
    embeddingModelVersion: "text-embedding-3-small",
    evaluationModelVersion: "gpt-4.1-mini",
    promptVersion: "1.0.0",
    ...overrides,
  };
}

describe("matching feature contract", () => {
  it("accepts a fully populated result", () => {
    expect(() => parseMatchResult(validResult())).not.toThrow();
  });

  it("rejects a score outside 0-1", () => {
    expect(() => parseMatchResult(validResult({ suitabilityScore: 1.5 }))).toThrow();
  });

  it("rejects an unrecognised recommended action", () => {
    expect(() => parseMatchResult(validResult({ recommendedAction: "hire_immediately" }))).toThrow();
  });

  it("rejects unknown keys, the same discipline the profile contract holds", () => {
    expect(() => parseMatchResult(validResult({ hiringProbability: 0.9 }))).toThrow();
  });

  it("defaults arrays to empty rather than requiring every field", () => {
    const result = matchResultSchema.parse({
      suitabilityScore: 0.5,
      confidence: 0.5,
      recommendedAction: "consider_with_caveats",
      promptVersion: "1.0.0",
    });
    expect(result.matchingSkills).toEqual([]);
    expect(result.missingSkills).toEqual([]);
    expect(result.uncertainRequirements).toEqual([]);
    expect(result.explanation).toEqual([]);
    expect(result.degraded).toBe(false);
  });
});

describe("degraded mode", () => {
  it("marks a result explicitly degraded rather than faking a score", () => {
    const result = buildDegradedMatchResult("1.0.0");
    expect(result.degraded).toBe(true);
    expect(result.confidence).toBe(0);
    expect(result.explanation).toEqual([]);
  });

  it("produces a schema-valid result", () => {
    expect(() => matchResultSchema.parse(buildDegradedMatchResult("1.0.0"))).not.toThrow();
  });
});
