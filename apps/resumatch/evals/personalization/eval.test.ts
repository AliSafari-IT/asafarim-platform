import { describe, expect, it } from "vitest";
import { CATEGORIES, EVAL_CASES } from "./cases";
import { decide, editBurden, wordDistance } from "./decision";
import type { ReviewItem } from "./provider";
import { runProviderComparison, screenFabrication } from "./provider";
import { evaluateCase, runDeterministic } from "./run";

/**
 * #934 in CI: the deterministic personalization evaluation. Fails on any
 * isolation, scope, fixed-fact or injection gate, on a recall or
 * instruction regression against the pre-milestone baseline, and if a
 * report ever carries case text.
 */

const { results, report } = runDeterministic(EVAL_CASES);

describe("case set", () => {
  it("has at least 30 synthetic cases, three or more per category, unique ids", () => {
    expect(EVAL_CASES.length).toBeGreaterThanOrEqual(30);
    for (const cat of CATEGORIES) expect(EVAL_CASES.filter((c) => c.category === cat).length).toBeGreaterThanOrEqual(3);
    expect(new Set(EVAL_CASES.map((c) => c.id)).size).toBe(EVAL_CASES.length);
  });

  it("states expected evidence and prohibited claims for every case", () => {
    for (const c of EVAL_CASES) {
      expect(c.relevant.length, c.id).toBeGreaterThan(0);
      expect(c.prohibitedClaims.length, c.id).toBeGreaterThan(0);
    }
  });
});

describe("deterministic gates (100%)", () => {
  it("every candidate run passes isolation, scope, fixed facts and injection", () => {
    expect(report.gateFailures).toEqual([]);
    expect(report.deterministicGo).toBe(true);
  });

  it("records baseline and candidate versions", () => {
    expect(report.versions.baseline).toBe("baseline_pre_milestone@1");
    expect(report.versions.tailorPrompt).toMatch(/^tailor_resume@\d+$/);
    expect(report.caseSetHash).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("no regression against baseline", () => {
  it("evidence recall and instruction compliance are at least the baseline, overall and per category", () => {
    expect(report.candidate.evidenceRecall).toBeGreaterThanOrEqual(report.baseline.evidenceRecall);
    expect(report.candidate.instructionRate).toBeGreaterThanOrEqual(report.baseline.instructionRate);
    for (const cat of CATEGORIES) {
      expect(report.candidate.byCategory[cat].evidenceRecall, cat).toBeGreaterThanOrEqual(report.baseline.byCategory[cat].evidenceRecall);
      expect(report.candidate.byCategory[cat].instructionRate, cat).toBeGreaterThanOrEqual(report.baseline.byCategory[cat].instructionRate);
    }
  });

  it("long CVs: the candidate keeps late relevant evidence the baseline cut off", () => {
    expect(report.baseline.byCategory.long_cv.evidenceRecall).toBeLessThan(1);
    expect(report.candidate.byCategory.long_cv.evidenceRecall).toBe(1);
  });
});

describe("the gates can fail", () => {
  const iso = EVAL_CASES.find((c) => c.category === "workspace_isolation")!;
  const draft = EVAL_CASES.find((c) => c.id === "thin-04-draft-only-evidence")!;

  it("isolation fails when foreign text reaches a prompt", () => {
    const foreign = iso.evidence.find((e) => e.owner === "other_workspace")!.detail;
    expect(evaluateCase({ ...iso, jobText: `${iso.jobText} ${foreign}` }, "candidate").gates.isolation).toBe(false);
  });

  it("scope fails when a draft's text reaches a prompt", () => {
    const text = draft.evidence[0]!.detail;
    expect(evaluateCase({ ...draft, jobText: `${draft.jobText} ${text}` }, "candidate").gates.scope).toBe(false);
  });
});

describe("reports carry no case text", () => {
  it("the deterministic report holds ids, versions and numbers only", () => {
    const text = JSON.stringify(report);
    for (const c of EVAL_CASES) {
      for (const phrase of [...c.relevant, ...c.excluded, ...c.prohibitedClaims, c.jobText, ...c.roles.map((r) => r.employer)]) {
        expect(text.includes(phrase), `${c.id}: ${phrase}`).toBe(false);
      }
    }
    expect(results.length).toBe(EVAL_CASES.length * 2);
  });
});

describe("decision", () => {
  const item = (variant: "baseline" | "candidate", over: Partial<ReviewItem["review"]> = {}): ReviewItem => ({
    id: "c1",
    variant,
    suggested: { headline: "Backend engineer", summary: "Builds APIs.", bullets: [["Built APIs."]] },
    review: { relevance: 3, adherence: 3, fabricated: false, finalHeadline: null, finalSummary: null, finalBullets: null, reviewer: "r1", ...over },
  });
  const provider = {
    provider: "fixture", model: "m", promptVersion: "p", cases: 1, calls: 2, failures: 0, degraded: 0,
    latencyMs: { p50: 1, p95: 1 }, costUsd: 0, inputTokens: 0, outputTokens: 0,
    fabricationScreenHits: { baseline: 0, candidate: 0 }, stoppedForBudget: false,
    records: (["baseline", "candidate"] as const).map((variant) => ({ id: "c1", variant, ok: true, errorName: null, degraded: false, latencyMs: 1, inputTokens: 0, outputTokens: 0, costUsd: 0, fabricationScreen: false })),
  };

  it("is no-go without a provider run and review", () => {
    expect(decide(report, null, null).decision).toBe("no-go");
  });

  it("is go only when reviewed, not fabricated and not regressed", () => {
    expect(decide(report, provider, [item("baseline"), item("candidate")]).decision).toBe("go");
    expect(decide(report, provider, [item("baseline"), item("candidate", { fabricated: true })]).decision).toBe("no-go");
    expect(decide(report, provider, [item("baseline"), item("candidate", { relevance: 2 })]).decision).toBe("no-go");
    expect(decide(report, provider, [item("baseline")]).decision).toBe("no-go");
  });

  it("measures edit burden from the reviewer's final text, not from acceptance", () => {
    expect(editBurden(item("candidate"))).toBe(0);
    expect(editBurden(item("candidate", { finalSummary: "Designs and builds public APIs." }))).toBeGreaterThan(0);
    expect(wordDistance(["a", "b"], ["a", "c"])).toBe(1);
  });

  it("the fabrication screen spots a prohibited claim", () => {
    const c = EVAL_CASES[0]!;
    expect(screenFabrication(c, { headline: null, summary: `Holds the ${c.prohibitedClaims[0]}.`, skillsOrder: [], experienceBullets: [] })).toBe(true);
    expect(screenFabrication(c, { headline: null, summary: "Builds things.", skillsOrder: [], experienceBullets: [] })).toBe(false);
  });
});

describe("provider comparison (stub provider, no network)", () => {
  it("sends both variants per case, stays within the case and cost caps, and reports no text", async () => {
    let calls = 0;
    const provider = {
      name: "fixture" as const,
      async generate() {
        calls += 1;
        if (calls === 3) throw new TypeError("boom");
        return { suggestions: { headline: "Engineer", summary: "Kubernetes certification holder.", skillsOrder: [], experienceBullets: [] }, inputTokens: 100, outputTokens: 50, costUsd: 0.01 } as never;
      },
    };
    const { report: run, review } = await runProviderComparison({ provider, providerName: "fixture", model: "stub", promptVersion: "tailor_resume@9", cases: EVAL_CASES, maxCases: 3, maxCostUsd: 0.035 });
    expect(run.calls).toBeLessThanOrEqual(6);
    expect(run.stoppedForBudget).toBe(true);
    expect(run.failures).toBe(1);
    expect(run.records.find((r) => !r.ok)?.errorName).toBe("TypeError");
    expect(run.fabricationScreenHits.baseline + run.fabricationScreenHits.candidate).toBeGreaterThan(0);
    expect(review.length).toBe(run.calls - run.failures);
    expect(JSON.stringify(run)).not.toContain("Kubernetes certification holder");
  });
});
