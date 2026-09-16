import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODEL_CASCADE,
  EVALUATION_MODEL_VERSIONS,
  EVALUATION_PROMPT_VERSION,
  evaluationModelVersionFor,
} from "./registry";

describe("evaluation registry (JM-047)", () => {
  it("has a fixture evaluation model version, consistent with the embedding provider naming", () => {
    expect(EVALUATION_MODEL_VERSIONS.fixture).toBe("fixture-eval-1");
    expect(evaluationModelVersionFor("fixture")).toBe("fixture-eval-1");
  });

  it("prompt version is a non-empty string suitable for MatchResult.promptVersion", () => {
    expect(EVALUATION_PROMPT_VERSION.length).toBeGreaterThan(0);
    expect(EVALUATION_PROMPT_VERSION.length).toBeLessThanOrEqual(40);
  });

  it("model cascade is off by default", () => {
    expect(DEFAULT_MODEL_CASCADE.enabled).toBe(false);
    expect(DEFAULT_MODEL_CASCADE.escalateBelowConfidence).toBeGreaterThan(0);
    expect(DEFAULT_MODEL_CASCADE.escalateBelowConfidence).toBeLessThan(1);
  });
});
