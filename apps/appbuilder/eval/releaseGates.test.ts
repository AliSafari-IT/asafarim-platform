import { describe, expect, it } from "vitest";
import {
  EVALUATION_VERSION,
  M13_RELEASE_GATES,
  evaluateReleaseGates,
  formatGateReport,
} from "./releaseGates";
import type { EvaluationSummary } from "./scorer";

function summary(overrides: Partial<EvaluationSummary> = {}): EvaluationSummary {
  return {
    totalCases: 7,
    clarificationPrecisionRate: 1,
    targetAccuracyRate: 1,
    operationValidityRate: 1,
    planCompletionRate: 1,
    capabilityTruthfulnessRate: 1,
    ...overrides,
  };
}

describe("M13 release gates", () => {
  it("passes every scorer gate on a perfect run", () => {
    const report = evaluateReleaseGates(summary());
    expect(report.scorerGatesPassed).toBe(true);
    expect(report.blocking).toEqual([]);
  });

  it("stamps the corpus version, so a threshold is never reported without what it was measured against", () => {
    expect(evaluateReleaseGates(summary()).evaluationVersion).toBe(EVALUATION_VERSION);
  });

  it("treats a metric no case exercised as blocking, NOT as a pass", () => {
    // A gate that silently passes because nothing measured it is a
    // decorative gate. This is the single most important case in the file.
    const report = evaluateReleaseGates(summary({ targetAccuracyRate: null }));
    const gate = report.gates.find((g) => g.key === "targetAccuracy")!;
    expect(gate.status).toBe("not_measured");
    expect(report.scorerGatesPassed).toBe(false);
    expect(report.blocking.map((g) => g.key)).toContain("targetAccuracy");
  });

  it("fails a min-direction gate that falls below its threshold", () => {
    const report = evaluateReleaseGates(summary({ targetAccuracyRate: 0.97 }));
    const gate = report.gates.find((g) => g.key === "targetAccuracy")!;
    expect(gate.status).toBe("not_met");
    expect(gate.threshold).toBe(0.98);
    expect(report.scorerGatesPassed).toBe(false);
  });

  it("accepts a min-direction gate exactly at its threshold", () => {
    const report = evaluateReleaseGates(summary({ targetAccuracyRate: 0.98 }));
    expect(report.gates.find((g) => g.key === "targetAccuracy")!.status).toBe("met");
  });

  it("fails a max-direction gate that rises above its threshold", () => {
    // 0.9 precision => 0.1 unnecessary-clarification rate, over the 0.05 cap.
    const report = evaluateReleaseGates(summary({ clarificationPrecisionRate: 0.9 }));
    expect(report.gates.find((g) => g.key === "unnecessaryClarification")!.status).toBe(
      "not_met"
    );
  });

  it("never auto-passes an externally-verified gate", () => {
    // Zero-tolerance gates (cross-app access, unconfirmed destructive apply,
    // cleanup coverage) are asserted by other suites. Reporting them as
    // "met" from a scorer that cannot see them would be a false claim.
    const report = evaluateReleaseGates(summary());
    for (const key of [
      "crossAppAttachmentAccess",
      "destructiveApplyWithoutConfirmation",
      "cleanupWithinRetentionWindow",
    ] as const) {
      const gate = report.gates.find((g) => g.key === key)!;
      expect(gate.status).toBe("not_measured");
      expect(gate.source).toBe("external");
      expect(gate.verifiedBy).toBeTruthy();
    }
  });

  it("does not let an unmeasurable external gate block the scorer verdict", () => {
    // They are reported for the release checklist, not enforced here —
    // otherwise no run could ever pass.
    const report = evaluateReleaseGates(summary());
    expect(report.blocking).toEqual([]);
  });

  it("covers every metric in the milestone's release-target table", () => {
    expect(M13_RELEASE_GATES.map((g) => g.key).sort()).toEqual(
      [
        "capabilityClassification",
        "cleanupWithinRetentionWindow",
        "clarificationPrecision",
        "crossAppAttachmentAccess",
        "destructiveApplyWithoutConfirmation",
        "schemaValidOperations",
        "targetAccuracy",
        "unnecessaryClarification",
      ].sort()
    );
  });

  it("renders a report that names the corpus, every gate, and why an external gate is not scored", () => {
    const text = formatGateReport(evaluateReleaseGates(summary({ targetAccuracyRate: null })));
    expect(text).toContain(EVALUATION_VERSION);
    expect(text).toContain("[N/M]");
    expect(text).toContain("verified by:");
    expect(text).toMatch(/blocking release/);
  });
});
