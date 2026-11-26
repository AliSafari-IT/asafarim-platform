import { describe, expect, it } from "vitest";
import { FIT_EVAL_CASES } from "./cases";
import { runFitProvider } from "./provider";
import { evaluateOutput, prepareCase, runDeterministic } from "./run";
import { checkRelease, RELEASE_THRESHOLDS } from "./thresholds";
import type { FitProvider } from "../../lib/tailoring/fit/ai/provider";

/**
 * #971 in CI: the deterministic job fit benchmark. The keyword pipeline is
 * compared with the pre-#971 baseline on the same synthetic cases. The AI
 * release thresholds are only checked by a real-provider run (README.md);
 * here they are checked to be able to fail.
 */

const { report } = runDeterministic(FIT_EVAL_CASES);

describe("case set", () => {
  it("has a dev and a held-out split, unique ids, labels for every case", () => {
    expect(FIT_EVAL_CASES.filter((c) => c.split === "dev").length).toBeGreaterThanOrEqual(8);
    expect(FIT_EVAL_CASES.filter((c) => c.split === "heldout").length).toBeGreaterThanOrEqual(10);
    expect(new Set(FIT_EVAL_CASES.map((c) => c.id)).size).toBe(FIT_EVAL_CASES.length);
    for (const c of FIT_EVAL_CASES) expect(c.expected.length, c.id).toBeGreaterThan(0);
  });
});

describe("product rules hold for the keyword analysis", () => {
  it("never turns a missing requirement into an unmet one", () => {
    expect(report.keyword.all.unknownAsUnmetRate).toBe(0);
  });

  it("shows no number where there is too little to judge (the baseline did)", () => {
    expect(report.keyword.all.numberWithoutBasis).toBe(0);
    expect(report.baseline.all.numberWithoutBasis).toBeGreaterThan(0);
  });

  it("is stable: unrelated skills, reordered skills and a repeated title do not move the match", () => {
    for (const delta of Object.values(report.stability.keyword)) expect(delta).toBeLessThanOrEqual(5);
  });
});

describe("no regression against the baseline", () => {
  it("judgment accuracy and false support are at least as good", () => {
    expect(report.keyword.all.judgmentAccuracy).toBeGreaterThanOrEqual(report.baseline.all.judgmentAccuracy);
    expect(report.keyword.all.falseSupportRate).toBeLessThanOrEqual(report.baseline.all.falseSupportRate);
  });

  it("the match lands in the labelled range at least as often", () => {
    expect(report.keyword.all.scoreInRangeRate).toBeGreaterThanOrEqual(report.baseline.all.scoreInRangeRate);
  });
});

describe("release thresholds can fail and pass", () => {
  it("the keyword analysis does not meet the AI release thresholds", () => {
    const checks = checkRelease(report.keyword.heldout, { failureRate: 0, meanCostUsd: 0, p95LatencyMs: 0 });
    expect(checks.find((c) => c.name === "extractionRecall")?.pass).toBe(false);
  });

  it("perfect replies pass, and a reply that claims support without evidence is caught", async () => {
    // A stub provider that answers every case with its labels: extraction
    // quotes each expected requirement and gives the first allowed judgment.
    const labelled: FitProvider = {
      name: "fixture",
      analyze: async (call) => {
        const c = FIT_EVAL_CASES.find((x) => prepareCase(x).inputs.jobText === call.inputs.jobText)!;
        const run = prepareCase(c);
        const lines = run.inputs.jobText.split("\n");
        const requirements = c.expected.map((e, i) => {
          const line = lines.find((l) => l.toLowerCase().includes(e.key)) ?? e.key;
          return { key: `r${i}`, quote: line.replace(/^[-•*]\s*/, "").trim(), priority: "required" as const, category: "skill" as const, essential: false, anyOf: null };
        });
        const assessments = c.expected.map((e, i) => ({ key: `r${i}`, judgment: e.ok.includes("unknown") ? ("unknown" as const) : e.ok[0]!, citations: [], explanation: "x", equivalence: null }));
        return { output: { requirements, moreRequirementsOmitted: false, assessments }, inputTokens: 1, outputTokens: 1, costUsd: 0, providerName: "fixture", modelVersion: "stub", promptVersion: call.promptVersion } as never;
      },
    };
    const { report: run } = await runFitProvider({ provider: labelled, providerName: "fixture", model: "stub", cases: FIT_EVAL_CASES, maxCases: 18, maxCostUsd: 1 });
    expect(run.casesRun).toBe(18);
    expect(run.model_metrics.heldout.extractionRecall).toBeGreaterThanOrEqual(RELEASE_THRESHOLDS.extractionRecall);
    expect(run.model_metrics.heldout.unknownAsUnmetRate).toBe(0);

    const c = FIT_EVAL_CASES.find((x) => x.id === "ho-language-level")!;
    const r = prepareCase(c);
    const line = r.inputs.jobText.split("\n").find((l) => l.toLowerCase().includes(c.expected[0]!.key))!.replace(/^[-•*]\s*/, "");
    const claimed = evaluateOutput(c, "model", {
      requirements: [{ key: "a", quote: line, priority: "required", category: "skill", essential: false, anyOf: null }],
      moreRequirementsOmitted: false,
      assessments: [{ key: "a", judgment: "direct", citations: [{ sourceId: "skills", quote: "made up" }], explanation: "x", equivalence: null }],
    });
    // The invented citation is rejected and "direct" without evidence downgraded.
    expect(claimed.rejectedCitations + claimed.downgraded).toBeGreaterThan(0);
    expect(claimed.falseSupport).toBe(0);
  });

  it("the provider run stops at the spend cap", async () => {
    const pricey: FitProvider = {
      name: "fixture",
      analyze: async () => ({ output: { requirements: [], moreRequirementsOmitted: false, assessments: [] }, inputTokens: 1, outputTokens: 1, costUsd: 0.6, providerName: "fixture", modelVersion: "stub", promptVersion: "job_fit@1" }) as never,
    };
    const { report: run } = await runFitProvider({ provider: pricey, providerName: "fixture", model: "stub", cases: FIT_EVAL_CASES, maxCases: 18, maxCostUsd: 1 });
    expect(run.casesRun).toBe(2);
    expect(run.stoppedOnBudget).toBe(true);
    expect(run.releaseGo).toBe(false);
  });
});

describe("reports carry no case text", () => {
  it("the deterministic report holds ids, versions and numbers only", () => {
    const text = JSON.stringify(report);
    for (const c of FIT_EVAL_CASES) {
      expect(text).not.toContain(c.job.slice(0, 40));
      for (const e of c.expected) expect(text.toLowerCase()).not.toContain(`"${e.key}"`);
    }
  });
});
