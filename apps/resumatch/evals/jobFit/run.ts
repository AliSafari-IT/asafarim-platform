import { createHash } from "node:crypto";
import type { GenerationEvidence } from "../../lib/evidence/prompt";
import { parseProfileContent, type CandidateProfileContent } from "../../lib/profile/contract";
import { FIT_CONTRACT_VERSION, type FitAnalysis, type FitJudgment, type FitModelOutput } from "../../lib/tailoring/fit/contract";
import { buildFitInputs, type FitInputs } from "../../lib/tailoring/fit/inputs";
import { keywordFitOutput } from "../../lib/tailoring/fit/keyword";
import { applyOverlay } from "../../lib/tailoring/fit/overlay";
import { FIT_RUBRIC_VERSION, scoreFit, type FitScore } from "../../lib/tailoring/fit/rubric";
import { validateFitOutput } from "../../lib/tailoring/fit/validate";
import { assessJobFit } from "../../lib/tailoring/jobFit";
import type { FitEvalCase, Split } from "./cases";

/**
 * The job fit benchmark (#971), without a database or a model.
 *
 * Three variants are measured on the same cases:
 * - `baseline`: what ResuMatch showed before #971. The key-term scope
 *   score from `assessJobFit` as the "match", and the requirement coverage
 *   of the tailoring selection as the per-requirement judgments.
 * - `keyword`: the new pipeline with the labelled basic keyword analysis
 *   (the fallback when no AI is configured): validation, rubric, gate.
 * - `model`: the new pipeline fed with a provider's reply. Only
 *   `provider.ts` produces it; CI never calls a model.
 *
 * Reports hold ids, versions and numbers, never case text.
 */

export type Variant = "baseline" | "keyword" | "model";

export interface CaseRun {
  inputs: FitInputs;
  profile: CandidateProfileContent;
}

export function evidenceFor(c: FitEvalCase): GenerationEvidence {
  const professional = (c.evidence ?? []).map((e, i) => ({
    revisionId: `rev_${c.id}_${i}`,
    kind: "PROJECT" as const,
    title: e.title,
    detail: e.detail,
    role: null,
    roleIndex: null,
  }));
  return { professional, motivation: [], revisionIds: professional.map((p) => p.revisionId) };
}

export function prepareCase(c: FitEvalCase): CaseRun {
  const profile = parseProfileContent(c.profile);
  return { profile, inputs: buildFitInputs({ profile, rawJobText: c.job, evidence: evidenceFor(c) }) };
}

/** The new pipeline from a model-shaped reply: validate, overlay, score. */
export function analyseOutput(run: CaseRun, output: FitModelOutput, method: "keyword" | "ai"): { analysis: FitAnalysis; score: FitScore } {
  const analysis = validateFitOutput({
    output,
    jobText: run.inputs.jobText,
    sources: run.inputs.sources,
    method,
    completeness: { jobTruncated: run.inputs.jobTruncated, profileSentencesOmitted: run.inputs.profileSentencesOmitted },
  });
  return { analysis, score: scoreFit(applyOverlay(analysis, [], []), { profileTooThin: run.inputs.profileTooThin }) };
}

export interface CaseResult {
  id: string;
  split: Split;
  variant: Variant;
  /** Expected requirements found among the extracted ones. */
  expected: number;
  found: number;
  /** Found requirements judged within the labelled set. */
  correct: number;
  /** Judged supported (direct) where the label does not allow it. */
  falseSupport: number;
  /** Labelled "unknown only" requirements judged unmet or conflict. */
  unknownAsUnmet: number;
  unknownOnly: number;
  boilerplateExtracted: number;
  /** null: suppressed (insufficient information). */
  percent: number | null;
  scoreInRange: boolean;
  suitabilityOk: boolean | null;
  lowFit: boolean;
  rejectedQuotes: number;
  rejectedCitations: number;
  downgraded: number;
}

interface Judged {
  quote: string;
  judgment: FitJudgment;
}

function grade(c: FitEvalCase, variant: Variant, judged: Judged[], percent: number | null, extra: Partial<CaseResult>): CaseResult {
  let found = 0;
  let correct = 0;
  let falseSupport = 0;
  let unknownAsUnmet = 0;
  let unknownOnly = 0;
  for (const e of c.expected) {
    const onlyUnknown = e.ok.length === 1 && e.ok[0] === "unknown";
    if (onlyUnknown) unknownOnly += 1;
    const hit = judged.find((j) => j.quote.toLowerCase().includes(e.key));
    if (!hit) continue;
    found += 1;
    if (e.ok.includes(hit.judgment)) correct += 1;
    if (hit.judgment === "direct" && !e.ok.includes("direct")) falseSupport += 1;
    if (onlyUnknown && (hit.judgment === "unmet" || hit.judgment === "conflict")) unknownAsUnmet += 1;
  }
  const boilerplateExtracted = (c.mustNotExtract ?? []).filter((b) => judged.some((j) => j.quote.toLowerCase().includes(b))).length;
  const scoreInRange = c.scoreRange === null ? percent === null : percent !== null && percent >= c.scoreRange[0] && percent <= c.scoreRange[1];
  return {
    id: c.id,
    split: c.split,
    variant,
    expected: c.expected.length,
    found,
    correct,
    falseSupport,
    unknownAsUnmet,
    unknownOnly,
    boilerplateExtracted,
    percent,
    scoreInRange,
    suitabilityOk: null,
    lowFit: false,
    rejectedQuotes: 0,
    rejectedCitations: 0,
    downgraded: 0,
    ...extra,
  };
}

const BASELINE_JUDGMENT: Record<string, FitJudgment> = { supported: "direct", unmet: "unmet", conflict: "conflict", unknown: "unknown" };

export function evaluateBaseline(c: FitEvalCase, run = prepareCase(c)): CaseResult {
  const scope = assessJobFit(run.profile, run.inputs.jobText);
  const judged = run.inputs.selection.coverage.map((cov) => ({ quote: cov.text, judgment: BASELINE_JUDGMENT[cov.status] ?? "unknown" }));
  // The old screen always showed a number, even with nothing to compare.
  return grade(c, "baseline", judged, scope.score, { lowFit: scope.level === "low" });
}

export function evaluateOutput(c: FitEvalCase, variant: "keyword" | "model", output: FitModelOutput, run = prepareCase(c)): CaseResult {
  const { analysis, score } = analyseOutput(run, output, variant === "keyword" ? "keyword" : "ai");
  const byId = new Map(analysis.assessments.map((a) => [a.requirementId, a.judgment]));
  const judged = analysis.requirements.map((r) => ({ quote: r.quote, judgment: byId.get(r.id) ?? "unknown" }));
  return grade(c, variant, judged, score.suppressed ? null : score.percent, {
    suitabilityOk: c.suitability ? c.suitability.includes(score.suitability.overall) : null,
    lowFit: score.lowFit,
    rejectedQuotes: analysis.validation.requirementsRejected,
    rejectedCitations: analysis.validation.citationsRejected,
    downgraded: analysis.validation.judgmentsDowngraded,
  });
}

export function evaluateKeyword(c: FitEvalCase, run = prepareCase(c)): CaseResult {
  return evaluateOutput(c, "keyword", keywordFitOutput(run.inputs.selection, run.inputs.sources), run);
}

// ─── Stability ───────────────────────────────────────────────────────────

/** Changes that should not move the match by more than a few points. */
export const PERTURBATIONS = {
  /** Unrelated skills: the job's requirements are unchanged. */
  unrelatedSkills: (c: FitEvalCase): FitEvalCase => ({
    ...c,
    profile: {
      ...c.profile,
      skills: [...((c.profile.skills as { name: string }[] | undefined) ?? []), { name: "Watercolour painting" }, { name: "Beekeeping" }, { name: "Chess" }],
    },
  }),
  /** The same posting with its title repeated in the header, as job
   *  boards often do. */
  repeatedTitle: (c: FitEvalCase): FitEvalCase => {
    const [title = "", ...rest] = c.job.split("\n");
    return { ...c, job: [title, title, ...rest].join("\n") };
  },
  /** The candidate's skills listed in reverse order. */
  reorderedSkills: (c: FitEvalCase): FitEvalCase => ({
    ...c,
    profile: { ...c.profile, skills: [...((c.profile.skills as unknown[] | undefined) ?? [])].reverse() },
  }),
} as const;

export type Perturbation = keyof typeof PERTURBATIONS;

// ─── Aggregates ──────────────────────────────────────────────────────────

export interface Metrics {
  cases: number;
  extractionRecall: number;
  judgmentAccuracy: number;
  falseSupportRate: number;
  unknownAsUnmetRate: number;
  boilerplateExtracted: number;
  scoreInRangeRate: number;
  suitabilityAccuracy: number | null;
  /** Cases with a number although the label says there is too little to judge. */
  numberWithoutBasis: number;
}

const ratio = (a: number, b: number) => (b === 0 ? 1 : Math.round((a / b) * 1000) / 1000);

export function aggregate(results: CaseResult[], cases: FitEvalCase[]): Metrics {
  const sum = (f: (r: CaseResult) => number) => results.reduce((n, r) => n + f(r), 0);
  const suit = results.filter((r) => r.suitabilityOk !== null);
  const caseById = new Map(cases.map((c) => [c.id, c]));
  return {
    cases: results.length,
    extractionRecall: ratio(sum((r) => r.found), sum((r) => r.expected)),
    judgmentAccuracy: ratio(sum((r) => r.correct), sum((r) => r.found)),
    falseSupportRate: ratio(sum((r) => r.falseSupport), sum((r) => r.found)),
    unknownAsUnmetRate: ratio(sum((r) => r.unknownAsUnmet), sum((r) => r.unknownOnly)),
    boilerplateExtracted: sum((r) => r.boilerplateExtracted),
    scoreInRangeRate: ratio(results.filter((r) => r.scoreInRange).length, results.length),
    suitabilityAccuracy: suit.length ? ratio(suit.filter((r) => r.suitabilityOk).length, suit.length) : null,
    numberWithoutBasis: results.filter((r) => caseById.get(r.id)?.scoreRange === null && r.percent !== null).length,
  };
}

export interface DeterministicReport {
  versions: { rubric: string; contract: string; caseSetHash: string };
  baseline: Record<Split | "all", Metrics>;
  keyword: Record<Split | "all", Metrics>;
  /** Largest change in the match under each perturbation, in points. */
  stability: Record<Variant extends "model" ? never : "baseline" | "keyword", Record<Perturbation, number>>;
}

export function caseSetHash(cases: FitEvalCase[]): string {
  return createHash("sha256").update(JSON.stringify(cases)).digest("hex").slice(0, 16);
}

export function bySplit(results: CaseResult[], cases: FitEvalCase[]): Record<Split | "all", Metrics> {
  return {
    all: aggregate(results, cases),
    dev: aggregate(results.filter((r) => r.split === "dev"), cases),
    heldout: aggregate(results.filter((r) => r.split === "heldout"), cases),
  };
}

function maxDelta(cases: FitEvalCase[], evaluate: (c: FitEvalCase) => CaseResult, perturb: (c: FitEvalCase) => FitEvalCase): number {
  let worst = 0;
  for (const c of cases) {
    const a = evaluate(c).percent;
    const b = evaluate(perturb(c)).percent;
    if (a === null && b === null) continue;
    worst = Math.max(worst, a === null || b === null ? 100 : Math.abs(a - b));
  }
  return worst;
}

export function runDeterministic(cases: FitEvalCase[]): { baseline: CaseResult[]; keyword: CaseResult[]; report: DeterministicReport } {
  const baseline: CaseResult[] = [];
  const keyword: CaseResult[] = [];
  for (const c of cases) {
    const run = prepareCase(c);
    baseline.push(evaluateBaseline(c, run));
    keyword.push(evaluateKeyword(c, run));
  }
  const stability = {
    baseline: Object.fromEntries(
      (Object.keys(PERTURBATIONS) as Perturbation[]).map((p) => [p, maxDelta(cases, (c) => evaluateBaseline(c), PERTURBATIONS[p])]),
    ) as Record<Perturbation, number>,
    keyword: Object.fromEntries(
      (Object.keys(PERTURBATIONS) as Perturbation[]).map((p) => [p, maxDelta(cases, (c) => evaluateKeyword(c), PERTURBATIONS[p])]),
    ) as Record<Perturbation, number>,
  };
  return {
    baseline,
    keyword,
    report: {
      versions: { rubric: FIT_RUBRIC_VERSION, contract: FIT_CONTRACT_VERSION, caseSetHash: caseSetHash(cases) },
      baseline: bySplit(baseline, cases),
      keyword: bySplit(keyword, cases),
      stability,
    },
  };
}
