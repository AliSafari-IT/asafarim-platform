import { describe, expect, it } from "vitest";
import { computeReleaseEligibility, countMandatoryPassed, type GateOutcomeForEligibility } from "./eligibility";

function gate(mandatory: boolean, status: GateOutcomeForEligibility["status"]): GateOutcomeForEligibility {
  return { mandatory, status };
}

describe("computeReleaseEligibility", () => {
  it("is eligible when every mandatory gate passed", () => {
    expect(computeReleaseEligibility([gate(true, "passed"), gate(true, "passed"), gate(false, "failed")])).toBe(true);
  });

  it("is NOT eligible when a mandatory gate failed", () => {
    expect(computeReleaseEligibility([gate(true, "passed"), gate(true, "failed")])).toBe(false);
  });

  it("is NOT eligible when a mandatory gate was skipped — skipped is not positive evidence", () => {
    expect(computeReleaseEligibility([gate(true, "passed"), gate(true, "skipped")])).toBe(false);
  });

  it("is NOT eligible when a mandatory gate hit infrastructure_error or flaky", () => {
    expect(computeReleaseEligibility([gate(true, "passed"), gate(true, "infrastructure_error")])).toBe(false);
    expect(computeReleaseEligibility([gate(true, "passed"), gate(true, "flaky")])).toBe(false);
  });

  it("is NOT eligible when there are zero mandatory gates at all (no positive evidence exists)", () => {
    expect(computeReleaseEligibility([gate(false, "passed")])).toBe(false);
  });

  it("ignores non-mandatory gates entirely when deciding eligibility", () => {
    expect(computeReleaseEligibility([gate(true, "passed"), gate(false, "failed"), gate(false, "skipped")])).toBe(true);
  });
});

describe("countMandatoryPassed", () => {
  it("counts only mandatory gates in the total, and only passed mandatory gates as passed", () => {
    const gates = [gate(true, "passed"), gate(true, "failed"), gate(false, "passed"), gate(true, "skipped")];
    expect(countMandatoryPassed(gates)).toEqual({ total: 3, passed: 1 });
  });
});
