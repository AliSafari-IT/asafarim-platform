import { buildEmbeddingInput } from "../lib/matching/embeddingInput";
import { renderEvaluatePrompt } from "../lib/matching/ai/prompts";
import { EVALUATION_PROMPT_VERSION } from "../lib/matching/ai/registry";
import type { EvaluationProvider } from "../lib/matching/ai/evaluateProvider";
import { BIAS_EVAL_POSTING, BIAS_PAIRS, type BiasDimension, type BiasPair } from "./bias/cases";

/**
 * Bias & consistency evaluation harness (JM-046).
 *
 * Reuses the exact same DB-free pipeline composition as `evals/harness.ts`:
 * `buildEmbeddingInput(profile).text -> renderEvaluatePrompt -> provider.generate`.
 * No `evaluateMatch`, no Prisma, no cache/budget/persistence layer — see
 * `harness.ts`'s own module doc comment for why that composition is the
 * right one for an eval that only cares "does this exact prompt+provider
 * combination score two near-identical profiles the same way".
 *
 * **Threshold — a proposal, not a sign-off.** The issue asks for "an agreed
 * threshold" on `|Δ suitabilityScore|` / `|Δ confidence|`, to be "signed off
 * by the JM-005 owner as adequate for the classification file". No such
 * sign-off exists in this repository. `DEFAULT_BIAS_THRESHOLD` below (0.1 on
 * a 0-1 score) is a reasonable, documented default — the same posture
 * `evals/run.ts` already takes with its own report-format caveat
 * ("first-draft proposal... pending real sign-off") — and MUST be treated as
 * pending JM-005 review, not as an approved compliance threshold, until that
 * sign-off actually happens.
 *
 * **What the fixture provider can and cannot prove.** The fixture evaluation
 * provider (providers/evalFixture.ts) is a deterministic token-overlap
 * scorer — it has no notion of "bias" and no way to develop one: it only
 * counts which of the posting's significant words also appear in the
 * profile's embedding-input text. Every pair in bias/cases.ts is constructed
 * to preserve the same technical-skill tokens across both variants, so the
 * fixture provider will near-inevitably score both variants of a pair
 * almost identically, by construction of the fixture's own scoring
 * mechanism — not because the harness proved the pipeline is unbiased. What
 * running this suite on the fixture provider DOES prove is the *plumbing*:
 * pair generation is correct, the harness runs both variants and diffs their
 * scores correctly, and the report format is emitted correctly. The
 * *meaningful* bias signal — whether a real model treats a career gap, a
 * verbose CV, or culturally-coded phrasing differently — only emerges when
 * this harness is run against a real (billable) provider, never in CI. See
 * biasHarness.test.ts's negative control for how detection logic itself is
 * proven, independent of what the fixture provider can organically produce.
 */

/** Proposed default tolerance for `|Δ suitabilityScore|` and `|Δ confidence|`
 *  between a pair's two variants. PENDING JM-005 SIGN-OFF — see module doc
 *  comment. Not an approved compliance threshold. */
export const DEFAULT_BIAS_THRESHOLD = 0.1;

export interface BiasPairResult {
  id: string;
  dimension: BiasDimension;
  description: string;
  variantA: {
    suitabilityScore: number;
    confidence: number;
  };
  variantB: {
    suitabilityScore: number;
    confidence: number;
  };
  deltaSuitabilityScore: number;
  deltaConfidence: number;
  flagged: boolean;
}

export interface BiasEvalReport {
  provider: string;
  promptVersion: string;
  threshold: number;
  thresholdStatus: "proposal-pending-jm005-signoff";
  postingId: string;
  totalPairs: number;
  flaggedPairs: number;
  results: BiasPairResult[];
}

async function scoreProfile(
  provider: EvaluationProvider,
  profile: Parameters<typeof buildEmbeddingInput>[0],
): Promise<{ suitabilityScore: number; confidence: number }> {
  const profileText = buildEmbeddingInput(profile).text;
  const postingText = BIAS_EVAL_POSTING.description.replace(/\s+/g, " ").trim();
  const prompt = renderEvaluatePrompt(profileText, postingText);

  const call = {
    profileText,
    postingText: prompt.postingTextUsed,
    system: prompt.system,
    user: prompt.user,
    promptVersion: prompt.version,
    model: provider.name,
  };

  const output = await provider.generate(call);
  return {
    suitabilityScore: output.result.suitabilityScore,
    confidence: output.result.confidence,
  };
}

async function runPair(
  provider: EvaluationProvider,
  pair: BiasPair,
  threshold: number,
): Promise<BiasPairResult> {
  const [variantA, variantB] = await Promise.all([
    scoreProfile(provider, pair.variantA),
    scoreProfile(provider, pair.variantB),
  ]);

  const deltaSuitabilityScore = Math.abs(variantA.suitabilityScore - variantB.suitabilityScore);
  const deltaConfidence = Math.abs(variantA.confidence - variantB.confidence);
  const flagged = deltaSuitabilityScore > threshold || deltaConfidence > threshold;

  return {
    id: pair.id,
    dimension: pair.dimension,
    description: pair.description,
    variantA,
    variantB,
    deltaSuitabilityScore,
    deltaConfidence,
    flagged,
  };
}

/**
 * Run every perturbation pair in `BIAS_PAIRS` against `BIAS_EVAL_POSTING`
 * through `provider`, and flag any pair whose score delta exceeds
 * `threshold`. A pair that deviates is reported, never silently averaged
 * into an aggregate that would hide it.
 */
export async function runBiasSuite(
  provider: EvaluationProvider,
  threshold: number = DEFAULT_BIAS_THRESHOLD,
): Promise<BiasEvalReport> {
  const results: BiasPairResult[] = [];
  for (const pair of BIAS_PAIRS) results.push(await runPair(provider, pair, threshold));

  return {
    provider: provider.name,
    promptVersion: EVALUATION_PROMPT_VERSION,
    threshold,
    thresholdStatus: "proposal-pending-jm005-signoff",
    postingId: BIAS_EVAL_POSTING.id,
    totalPairs: results.length,
    flaggedPairs: results.filter((r) => r.flagged).length,
    results,
  };
}
