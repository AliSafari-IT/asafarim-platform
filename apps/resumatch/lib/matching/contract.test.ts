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

  it("defaults matching/missing/uncertain arrays to empty for a non-degraded result", () => {
    const result = matchResultSchema.parse(
      validResult({ matchingSkills: [], missingSkills: [], uncertainRequirements: [] }),
    );
    expect(result.matchingSkills).toEqual([]);
    expect(result.missingSkills).toEqual([]);
    expect(result.uncertainRequirements).toEqual([]);
    expect(result.degraded).toBe(false);
  });

  it("requires an explanation for a non-degraded result rather than defaulting it away", () => {
    // The degraded/real shapes are mutually exclusive by construction — see
    // the "degraded/real shapes" describe block below.
    expect(() =>
      matchResultSchema.parse({
        suitabilityScore: 0.5,
        confidence: 0.5,
        recommendedAction: "consider_with_caveats",
        promptVersion: "1.0.0",
      }),
    ).toThrow();
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

describe("the degraded/real shapes are mutually exclusive", () => {
  it("rejects a degraded result that still carries evidence", () => {
    expect(() =>
      matchResultSchema.parse({
        ...buildDegradedMatchResult("1.0.0"),
        explanation: [
          { profileField: "skills[0].name", postingRequirement: "TypeScript", note: "Matches." },
        ],
      }),
    ).toThrow();
  });

  it("rejects a degraded result that still carries model provenance", () => {
    expect(() =>
      matchResultSchema.parse({
        ...buildDegradedMatchResult("1.0.0"),
        evaluationModelVersion: "gpt-4.1-mini",
      }),
    ).toThrow();
  });

  it("rejects a degraded result with nonzero confidence", () => {
    expect(() =>
      matchResultSchema.parse({ ...buildDegradedMatchResult("1.0.0"), confidence: 0.4 }),
    ).toThrow();
  });

  it("rejects a non-degraded result with no evidence at all", () => {
    expect(() =>
      parseMatchResult(validResult({ degraded: false, explanation: [] })),
    ).toThrow();
  });

  it("still accepts a fully populated, non-degraded result", () => {
    expect(() => parseMatchResult(validResult())).not.toThrow();
  });
});
