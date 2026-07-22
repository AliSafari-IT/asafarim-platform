import { describe, it, expect } from "vitest";
import { RequirementsAnalysis, requiresClarification } from "./requirementsAnalysis";
import { PLANNING_LIMITS } from "../constants";

const base = {
  appPurpose: "Track things.",
  targetUsers: [],
  entities: [],
  relationships: [],
  roles: [],
  pages: [],
  dashboards: [],
  workflows: [],
  fileNeeds: [],
  assumptions: [],
  exclusions: [],
  clarificationQuestions: [],
  confidence: "high" as const,
};

describe("RequirementsAnalysis", () => {
  it("accepts a minimal valid analysis", () => {
    expect(RequirementsAnalysis.safeParse(base).success).toBe(true);
  });

  it("rejects a missing appPurpose", () => {
    const { appPurpose: _drop, ...rest } = base;
    expect(RequirementsAnalysis.safeParse(rest).success).toBe(false);
  });

  it("rejects a confidence value outside the closed enum", () => {
    expect(RequirementsAnalysis.safeParse({ ...base, confidence: "certain" }).success).toBe(false);
  });

  it("rejects more entities than PLANNING_LIMITS allows", () => {
    const tooMany = Array.from({ length: PLANNING_LIMITS.MAX_ENTITIES_DESCRIBED + 1 }, (_, i) => ({
      name: `Entity ${i}`,
      importantFields: [],
    }));
    expect(RequirementsAnalysis.safeParse({ ...base, entities: tooMany }).success).toBe(false);
  });

  it("rejects an appPurpose longer than the bounded medium-string length", () => {
    const tooLong = "x".repeat(PLANNING_LIMITS.MAX_MEDIUM_STRING + 1);
    expect(RequirementsAnalysis.safeParse({ ...base, appPurpose: tooLong }).success).toBe(false);
  });
});

describe("requiresClarification", () => {
  it("is true when confidence is low even with no questions", () => {
    expect(requiresClarification({ ...base, confidence: "low" })).toBe(true);
  });

  it("is true when any clarification question is present, regardless of confidence", () => {
    expect(
      requiresClarification({
        ...base,
        confidence: "high",
        clarificationQuestions: [{ id: "q1", question: "What is X?" }],
      }),
    ).toBe(true);
  });

  it("is false for a high-confidence analysis with no questions", () => {
    expect(requiresClarification(base)).toBe(false);
  });
});
