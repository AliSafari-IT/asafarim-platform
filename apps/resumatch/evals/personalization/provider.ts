/**
 * Bounded real-provider comparison (#934). Never run in CI: it costs money
 * and its output varies. Invoked by hand through
 * `scripts/eval-personalization.ts provider`, which requires
 * RESUMATCH_EVAL_ALLOW_PROVIDER=1 and caps both cases and spend.
 *
 * For each case it sends the baseline and the candidate CV prompt (the
 * exact prompts the deterministic run builds) and records:
 * - latency, tokens and cost per call, and failure counts;
 * - `fabricationScreen`: whether a prohibited claim from the case appears
 *   in the reply. A screen, not a verdict: the human review (rubric.md)
 *   decides what counts as fabricated, and the screen only makes sure a
 *   reviewer looks.
 *
 * Two outputs: a report with aggregates only (safe to commit), and a review
 * sheet with the synthetic replies for the human reviewer (kept out of git
 * under evals/personalization/out/).
 */

import type { ResuMatchAiProvider } from "../../lib/env";
import type { TailorProvider } from "../../lib/tailoring/ai/provider";
import { mergeTailoringSuggestions, type TailorSuggestions } from "../../lib/tailoring/ai/schema";
import type { EvalCase } from "./cases";
import { buildRun, type Variant } from "./run";

export const MAX_PROVIDER_CASES = 36;
export const DEFAULT_PROVIDER_CASES = 10;

export interface ProviderCallRecord {
  id: string;
  variant: Variant;
  ok: boolean;
  /** Error class name only, never a message. */
  errorName: string | null;
  degraded: boolean;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  fabricationScreen: boolean;
}

export interface ReviewItem {
  id: string;
  variant: Variant;
  /** The fields as the provider suggested them, merged onto the profile. */
  suggested: { headline: string | null; summary: string | null; bullets: string[][] };
  /** Filled in by the reviewer. See rubric.md. */
  review: {
    relevance: 1 | 2 | 3 | 4 | null;
    adherence: 1 | 2 | 3 | 4 | null;
    fabricated: boolean | null;
    /** What the reviewer would send, field by field; null: unchanged. */
    finalHeadline: string | null;
    finalSummary: string | null;
    finalBullets: string[][] | null;
    reviewer: string | null;
  };
}

export interface ProviderRunReport {
  provider: string;
  model: string;
  promptVersion: string;
  cases: number;
  calls: number;
  failures: number;
  degraded: number;
  latencyMs: { p50: number; p95: number };
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  fabricationScreenHits: { baseline: number; candidate: number };
  stoppedForBudget: boolean;
  records: ProviderCallRecord[];
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

export function screenFabrication(c: EvalCase, s: TailorSuggestions): boolean {
  const text = [s.headline ?? "", s.summary ?? "", ...s.experienceBullets.flat()].join("\n").toLowerCase();
  return c.prohibitedClaims.some((claim) => text.includes(claim.toLowerCase()));
}

export async function runProviderComparison(options: {
  provider: TailorProvider;
  providerName: ResuMatchAiProvider;
  model: string;
  promptVersion: string;
  cases: EvalCase[];
  maxCases: number;
  maxCostUsd: number;
}): Promise<{ report: ProviderRunReport; review: ReviewItem[] }> {
  const cases = options.cases.slice(0, Math.min(options.maxCases, MAX_PROVIDER_CASES));
  const records: ProviderCallRecord[] = [];
  const review: ReviewItem[] = [];
  let spent = 0;
  let stoppedForBudget = false;

  outer: for (const c of cases) {
    for (const variant of ["baseline", "candidate"] as const) {
      if (spent >= options.maxCostUsd) {
        stoppedForBudget = true;
        break outer;
      }
      const run = buildRun(c, variant);
      const started = Date.now();
      try {
        const out = await options.provider.generate({
          profileText: run.cv.profileTextUsed,
          jobText: run.cv.jobTextUsed,
          system: run.cv.system,
          user: run.cv.user,
          promptVersion: run.cv.version,
          model: options.model,
          profileSkillNames: run.profile.skills.map((s) => s.name),
          experienceSummaries: run.profile.experience.map((e) => e.summary),
          instructions: run.cv.instructionsUsed,
        });
        spent += out.costUsd;
        const merged = mergeTailoringSuggestions(run.profile, out.suggestions);
        records.push({
          id: c.id,
          variant,
          ok: true,
          errorName: null,
          degraded: false,
          latencyMs: Date.now() - started,
          inputTokens: out.inputTokens,
          outputTokens: out.outputTokens,
          costUsd: out.costUsd,
          fabricationScreen: screenFabrication(c, out.suggestions),
        });
        review.push({
          id: c.id,
          variant,
          suggested: { headline: merged.headline, summary: merged.summary, bullets: merged.experience.map((e) => e.bullets) },
          review: { relevance: null, adherence: null, fabricated: null, finalHeadline: null, finalSummary: null, finalBullets: null, reviewer: null },
        });
      } catch (error) {
        records.push({
          id: c.id,
          variant,
          ok: false,
          errorName: error instanceof Error ? error.name : "UnknownError",
          degraded: true,
          latencyMs: Date.now() - started,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          fabricationScreen: false,
        });
      }
    }
  }

  const ok = records.filter((r) => r.ok);
  return {
    report: {
      provider: options.providerName,
      model: options.model,
      promptVersion: options.promptVersion,
      cases: new Set(records.map((r) => r.id)).size,
      calls: records.length,
      failures: records.filter((r) => !r.ok).length,
      degraded: records.filter((r) => r.degraded).length,
      latencyMs: { p50: percentile(ok.map((r) => r.latencyMs), 50), p95: percentile(ok.map((r) => r.latencyMs), 95) },
      costUsd: Math.round(spent * 10_000) / 10_000,
      inputTokens: ok.reduce((a, r) => a + r.inputTokens, 0),
      outputTokens: ok.reduce((a, r) => a + r.outputTokens, 0),
      fabricationScreenHits: {
        baseline: records.filter((r) => r.variant === "baseline" && r.fabricationScreen).length,
        candidate: records.filter((r) => r.variant === "candidate" && r.fabricationScreen).length,
      },
      stoppedForBudget,
      records,
    },
    review,
  };
}
