export interface GateOutcomeForEligibility {
  mandatory: boolean;
  status: "pending" | "running" | "passed" | "failed" | "skipped" | "infrastructure_error" | "flaky" | "cancelled";
}

/**
 * The single, pure function that decides release eligibility (issue
 * requirement: "only a fully passing approved preview version becomes
 * release-eligible"). Every mandatory gate must have reached `passed`
 * specifically — `skipped` does NOT count, even for a gate that skipped for
 * a legitimate reason (e.g. "no workflows defined"): a skip means "we have
 * no evidence either way", and eligibility requires positive evidence, not
 * merely the absence of a negative. Never called on a non-terminal run.
 */
export function computeReleaseEligibility(gates: readonly GateOutcomeForEligibility[]): boolean {
  const mandatoryGates = gates.filter((g) => g.mandatory);
  if (mandatoryGates.length === 0) return false;
  return mandatoryGates.every((g) => g.status === "passed");
}

export function countMandatoryPassed(gates: readonly GateOutcomeForEligibility[]): { total: number; passed: number } {
  const mandatoryGates = gates.filter((g) => g.mandatory);
  return { total: mandatoryGates.length, passed: mandatoryGates.filter((g) => g.status === "passed").length };
}
