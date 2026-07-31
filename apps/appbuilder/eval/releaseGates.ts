import type { EvaluationSummary } from "./scorer";

/**
 * M13 slice G — the release gates.
 *
 * Slice A built the corpus and the scorer but nothing decided whether a
 * score was good enough; the milestone's targets lived only in a markdown
 * table. This module turns that table into something a release can fail on,
 * which is the whole point of calling them gates.
 *
 * The design decisions that matter:
 *
 * 1. **A `null` rate is NOT a pass.** A metric whose denominator was zero
 *    means the corpus never exercised it — that is a corpus problem, and
 *    treating "never measured" as "met the bar" is precisely how a quality
 *    gate becomes decorative. Such a gate reports `not_measured`, which is
 *    a release blocker for a required gate.
 *
 * 2. **Zero-tolerance gates are counts, not rates.** "Successful cross-app
 *    attachment access: 0" and "destructive apply without confirmation: 0"
 *    cannot be expressed as a percentage without implying some non-zero
 *    number would be acceptable. They are asserted by the integration and
 *    adversarial suites, not by this scorer, so they are declared here as
 *    externally-verified gates with an explicit pointer to the tests that
 *    own them — visible in the report rather than silently absent.
 *
 * 3. **The corpus is versioned.** A threshold means nothing without knowing
 *    what it was measured against, so `EVALUATION_VERSION` is stamped on
 *    every report and reported by readiness. Adding, removing, or relabeling
 *    a case requires bumping it — otherwise two runs with the same version
 *    string could mean different things.
 */

/**
 * Bump on ANY change to the corpus: cases added or removed, expected labels
 * changed, or the scoring of an existing metric changed. Format is
 * `m13.<major>.<minor>` — major for a change that makes historical scores
 * incomparable, minor for an addition that does not.
 */
export const EVALUATION_VERSION = "m13.1.0";

export type GateKey =
  | "targetAccuracy"
  | "unnecessaryClarification"
  | "clarificationPrecision"
  | "schemaValidOperations"
  | "capabilityClassification"
  | "crossAppAttachmentAccess"
  | "destructiveApplyWithoutConfirmation"
  | "cleanupWithinRetentionWindow";

export type GateStatus = "met" | "not_met" | "not_measured";

export interface ReleaseGate {
  key: GateKey;
  label: string;
  /** `min` — the rate must be at or above `threshold`; `max` — at or below. */
  direction: "min" | "max";
  threshold: number;
  /**
   * `scorer` gates are computed from an evaluation run here. `external`
   * gates are asserted elsewhere (integration/adversarial suites, the
   * retention sweep) and are declared so the release checklist is complete
   * rather than quietly missing its most important rows.
   */
  source: "scorer" | "external";
  /** Where an `external` gate is actually verified. */
  verifiedBy?: string;
}

export const M13_RELEASE_GATES: readonly ReleaseGate[] = [
  {
    key: "targetAccuracy",
    label: "Unique exact target resolution",
    direction: "min",
    threshold: 0.98,
    source: "scorer",
  },
  {
    key: "unnecessaryClarification",
    label: "Unnecessary clarification on actionable regression cases",
    direction: "max",
    threshold: 0.05,
    source: "scorer",
  },
  {
    key: "clarificationPrecision",
    label: "Necessary clarification precision",
    direction: "min",
    threshold: 0.95,
    source: "scorer",
  },
  {
    key: "schemaValidOperations",
    label: "Schema-valid operations",
    direction: "min",
    threshold: 0.99,
    source: "scorer",
  },
  {
    key: "capabilityClassification",
    label: "Capability classification accuracy",
    direction: "min",
    threshold: 0.95,
    source: "scorer",
  },
  {
    key: "crossAppAttachmentAccess",
    label: "Successful cross-app attachment access",
    direction: "max",
    threshold: 0,
    source: "external",
    verifiedBy:
      "lib/repositories/attachments.integration.test.ts (cross-app and unrelated-actor access are indistinguishable NotFoundError)",
  },
  {
    key: "destructiveApplyWithoutConfirmation",
    label: "Destructive apply without confirmation",
    direction: "max",
    threshold: 0,
    source: "external",
    verifiedBy:
      "lib/modification/pipeline.integration.test.ts + lib/modification/confirmation.test.ts (M04/M08 confirmation binding)",
  },
  {
    key: "cleanupWithinRetentionWindow",
    label: "Cleanup within retention window",
    direction: "min",
    threshold: 0.999,
    source: "external",
    verifiedBy:
      "lib/retention/sweep.integration.test.ts + the `cleanupLag` readiness section (lib/observability/readiness.ts)",
  },
];

export interface GateResult {
  key: GateKey;
  label: string;
  status: GateStatus;
  direction: "min" | "max";
  threshold: number;
  /** null when the metric was never exercised, or for an externally-verified gate. */
  actual: number | null;
  source: "scorer" | "external";
  verifiedBy?: string;
  note?: string;
}

export interface ReleaseGateReport {
  evaluationVersion: string;
  evaluatedAt: string;
  gates: GateResult[];
  /** True only when every scorer gate is `met`. External gates are reported, never auto-passed. */
  scorerGatesPassed: boolean;
  /** Scorer gates that did not pass, including any that could not be measured. */
  blocking: GateResult[];
}

function evaluate(
  gate: ReleaseGate,
  actual: number | null
): GateResult {
  if (gate.source === "external") {
    return {
      key: gate.key,
      label: gate.label,
      status: "not_measured",
      direction: gate.direction,
      threshold: gate.threshold,
      actual: null,
      source: "external",
      verifiedBy: gate.verifiedBy,
      note: "Verified by the test suite named above, not by this evaluation run.",
    };
  }

  if (actual === null) {
    return {
      key: gate.key,
      label: gate.label,
      status: "not_measured",
      direction: gate.direction,
      threshold: gate.threshold,
      actual: null,
      source: "scorer",
      note: "No case in the corpus exercised this metric — treated as blocking, not as a pass.",
    };
  }

  const met =
    gate.direction === "min" ? actual >= gate.threshold : actual <= gate.threshold;
  return {
    key: gate.key,
    label: gate.label,
    status: met ? "met" : "not_met",
    direction: gate.direction,
    threshold: gate.threshold,
    actual,
    source: "scorer",
  };
}

/**
 * Maps an `EvaluationSummary` onto the gate table.
 *
 * `unnecessaryClarification` deserves a note: the scorer measures
 * `clarificationPrecisionRate` as "the decision's clarify/don't-clarify call
 * matched what the product contract requires", over every case. Its
 * complement is the rate at which the assistant got that call WRONG in
 * either direction. The M13 table lists both a floor on precision and a
 * ceiling on unnecessary questions; with the current corpus those are two
 * readings of the same measurement, so this reports the complement honestly
 * rather than inventing a second number that looks independent but is not.
 * Splitting them properly requires the corpus to distinguish over- from
 * under-asking per case — recorded in the slice G doc as the next corpus
 * change, and the reason `EVALUATION_VERSION` exists.
 */
export function evaluateReleaseGates(
  summary: EvaluationSummary,
  now: Date = new Date()
): ReleaseGateReport {
  const actuals: Record<GateKey, number | null> = {
    targetAccuracy: summary.targetAccuracyRate,
    unnecessaryClarification:
      summary.clarificationPrecisionRate === null
        ? null
        : 1 - summary.clarificationPrecisionRate,
    clarificationPrecision: summary.clarificationPrecisionRate,
    schemaValidOperations: summary.operationValidityRate,
    capabilityClassification: summary.capabilityTruthfulnessRate,
    crossAppAttachmentAccess: null,
    destructiveApplyWithoutConfirmation: null,
    cleanupWithinRetentionWindow: null,
  };

  const gates = M13_RELEASE_GATES.map((gate) =>
    evaluate(gate, actuals[gate.key])
  );
  const scorerGates = gates.filter((g) => g.source === "scorer");
  const blocking = scorerGates.filter((g) => g.status !== "met");

  return {
    evaluationVersion: EVALUATION_VERSION,
    evaluatedAt: now.toISOString(),
    gates,
    scorerGatesPassed: blocking.length === 0,
    blocking,
  };
}

/** Human-readable one-line-per-gate rendering for CI logs and the release checklist. */
export function formatGateReport(report: ReleaseGateReport): string {
  const lines = [
    `M13 release gates (corpus ${report.evaluationVersion}, ${report.evaluatedAt})`,
  ];
  for (const gate of report.gates) {
    const target = `${gate.direction === "min" ? ">=" : "<="} ${gate.threshold}`;
    const actual =
      gate.actual === null ? "n/a" : `${(gate.actual * 100).toFixed(1)}%`;
    const mark =
      gate.status === "met" ? "PASS" : gate.status === "not_met" ? "FAIL" : "N/M";
    lines.push(`  [${mark}] ${gate.label}: ${actual} (target ${target})`);
    if (gate.note) lines.push(`         ${gate.note}`);
    if (gate.verifiedBy) lines.push(`         verified by: ${gate.verifiedBy}`);
  }
  lines.push(
    report.scorerGatesPassed
      ? "  All scorer-measured gates met. External gates must be confirmed from their suites before release."
      : `  ${report.blocking.length} scorer gate(s) blocking release.`
  );
  return lines.join("\n");
}
