import type { ResuMatchAiProvider } from "../../lib/env";
import { renderFitPrompt } from "../../lib/tailoring/fit/ai/prompts";
import type { FitProvider } from "../../lib/tailoring/fit/ai/provider";
import type { FitEvalCase } from "./cases";
import { bySplit, caseSetHash, evaluateOutput, prepareCase, type CaseResult, type Metrics } from "./run";
import { checkRelease, type ReleaseCheck } from "./thresholds";

/**
 * Bounded real-provider job fit run (#971). Never run in CI: it costs
 * money and its output varies. Invoked by hand through
 * `scripts/eval-job-fit.ts provider`, which requires
 * RESUMATCH_EVAL_ALLOW_PROVIDER=1 and caps cases and spend. It stops
 * before the next call once the spend reaches the cap.
 *
 * The report holds ids, versions and numbers; the replies themselves go to
 * a review sheet under evals/jobFit/out/ (git ignored) for the human check.
 */

export const MAX_PROVIDER_CASES = 18;

export interface FitCallRecord {
  id: string;
  ok: boolean;
  errorName: string | null;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface FitProviderReport {
  provider: ResuMatchAiProvider;
  model: string;
  promptVersion: string;
  caseSetHash: string;
  casesRun: number;
  stoppedOnBudget: boolean;
  spentUsd: number;
  model_metrics: Record<"all" | "dev" | "heldout", Metrics>;
  failureRate: number;
  meanCostUsd: number;
  p95LatencyMs: number;
  release: ReleaseCheck[];
  releaseGo: boolean;
  records: FitCallRecord[];
}

export interface FitReviewItem {
  id: string;
  reply: unknown;
  result: CaseResult | null;
  review: { agreesWithLabels: boolean | null; notes: string | null; reviewer: string | null };
}

function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]!;
}

export async function runFitProvider(opts: {
  provider: FitProvider;
  providerName: ResuMatchAiProvider;
  model: string;
  cases: FitEvalCase[];
  maxCases: number;
  maxCostUsd: number;
}): Promise<{ report: FitProviderReport; review: FitReviewItem[] }> {
  // Held-out cases first: they are the ones the release is judged on.
  const ordered = [...opts.cases.filter((c) => c.split === "heldout"), ...opts.cases.filter((c) => c.split === "dev")].slice(0, opts.maxCases);
  const records: FitCallRecord[] = [];
  const results: CaseResult[] = [];
  const review: FitReviewItem[] = [];
  let spent = 0;
  let stoppedOnBudget = false;
  let promptVersion = "";
  for (const c of ordered) {
    if (spent >= opts.maxCostUsd) {
      stoppedOnBudget = true;
      break;
    }
    const run = prepareCase(c);
    const prompt = renderFitPrompt({ jobText: run.inputs.jobTextUsed, sourcesText: run.inputs.sourcesText, language: "en" });
    promptVersion = prompt.version;
    const started = Date.now();
    try {
      const out = await opts.provider.analyze({
        inputs: run.inputs,
        system: prompt.system,
        user: prompt.user,
        promptVersion: prompt.version,
        model: opts.model,
        signal: AbortSignal.timeout(25_000),
      });
      spent += out.costUsd;
      const result = evaluateOutput(c, "model", out.output, run);
      results.push(result);
      records.push({ id: c.id, ok: true, errorName: null, latencyMs: Date.now() - started, inputTokens: out.inputTokens, outputTokens: out.outputTokens, costUsd: out.costUsd });
      review.push({ id: c.id, reply: out.output, result, review: { agreesWithLabels: null, notes: null, reviewer: null } });
    } catch (error) {
      records.push({ id: c.id, ok: false, errorName: error instanceof Error ? error.name : "Error", latencyMs: Date.now() - started, inputTokens: 0, outputTokens: 0, costUsd: 0 });
      review.push({ id: c.id, reply: null, result: null, review: { agreesWithLabels: null, notes: null, reviewer: null } });
    }
  }
  const ok = records.filter((r) => r.ok);
  const metrics = bySplit(results, opts.cases);
  const ops = {
    failureRate: records.length ? Math.round(((records.length - ok.length) / records.length) * 1000) / 1000 : 1,
    meanCostUsd: ok.length ? ok.reduce((n, r) => n + r.costUsd, 0) / ok.length : 0,
    p95LatencyMs: p95(ok.map((r) => r.latencyMs)),
  };
  const release = checkRelease(metrics.heldout, ops);
  const heldoutRun = results.filter((r) => r.split === "heldout").length;
  return {
    report: {
      provider: opts.providerName,
      model: opts.model,
      promptVersion,
      caseSetHash: caseSetHash(opts.cases),
      casesRun: records.length,
      stoppedOnBudget,
      spentUsd: Math.round(spent * 10_000) / 10_000,
      model_metrics: metrics,
      ...ops,
      release,
      // Every held-out case must have run for a go.
      releaseGo: heldoutRun === opts.cases.filter((c) => c.split === "heldout").length && release.every((r) => r.pass),
      records,
    },
    review,
  };
}
