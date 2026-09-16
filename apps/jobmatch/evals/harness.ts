import { buildEmbeddingInput } from "../lib/matching/embeddingInput";
import { renderEvaluatePrompt } from "../lib/matching/ai/prompts";
import { EVALUATION_PROMPT_VERSION, getEvaluationProvider } from "../lib/matching/ai/registry";
import type { MatchResult } from "../lib/matching/contract";
import type { JobMatchAiProvider } from "../lib/env";
import { EVAL_CASES, type EvalCase } from "./cases";

/**
 * Offline evaluation harness (JM-045). Mirrors apps/tasks-ai/evals/harness.ts's
 * shape and CaseResult/EvalReport contract.
 *
 * **How this runs without a database.** `evaluateMatch` (lib/matching/ai/
 * evaluate.ts) is hard-wired to Prisma — it fetches the confirmed profile
 * version and the job posting row before doing anything else, then goes
 * through the MatchRun cache and the AI usage ledger. None of that belongs
 * in a CI-safe, DB-free eval suite (the issue is explicit about this: "don't
 * accidentally make `pnpm ai:eval` require Postgres"). So this harness does
 * NOT call `evaluateMatch`. Instead it re-composes the exact same pipeline
 * pieces `evaluate.ts` calls, in the same order, directly on in-memory
 * fixture objects:
 *
 *   buildEmbeddingInput(profile).text
 *     -> renderEvaluatePrompt(profileText, postingText)   (same prompt fn)
 *     -> provider.generate(...)                            (same provider interface)
 *     -> parseMatchResult(...)                              (same schema guard,
 *        done implicitly: the fixture provider already returns a
 *        matchResultSchema-parsed MatchResult, and every provider must)
 *
 * This is deliberately the same composition `evaluate.ts` uses minus the
 * cache/budget/persistence layers (getCachedMatchRun, assertCanRunProviderCall,
 * recordUsage, recordMatchRun) — those are DB-backed infrastructure concerns
 * evaluate.integration.test.ts already covers against a real database. What
 * matters for an eval — "does this exact prompt+provider combination produce
 * the expected label from this profile/posting pair" — needs none of them.
 */

export interface EvalCaseResult {
  id: string;
  category: EvalCase["category"];
  pass: boolean;
  failures: string[];
  metrics: {
    suitabilityScore: number;
    confidence: number;
    recommendedAction: MatchResult["recommendedAction"];
    costUsd: number;
    latencyMs: number;
    consistent: boolean;
  };
}

export interface EvalReport {
  provider: string;
  promptVersion: string;
  total: number;
  passed: number;
  totalCostUsd: number;
  results: EvalCaseResult[];
}

/**
 * Fails loudly if a case's label was recorded against a prompt version that
 * is no longer current — "changing a prompt version requires re-labelling or
 * explicit waiver" (JM-045 acceptance criteria). A case may opt out via
 * `waivedPromptVersions` when a deliberate, reviewed decision says the new
 * wording does not invalidate the existing label.
 */
export function assertPromptVersionCurrent(c: EvalCase, currentVersion: string): string | null {
  if (c.promptVersionExpected === currentVersion) return null;
  if (c.waivedPromptVersions?.includes(currentVersion)) return null;
  return (
    `case "${c.id}" was labelled against prompt version "${c.promptVersionExpected}", ` +
    `but the live EVALUATION_PROMPT_VERSION is "${currentVersion}". Re-label this case's ` +
    `expectedRecommendedAction/scoreBand against the new prompt, or add "${currentVersion}" ` +
    `to its waivedPromptVersions as an explicit, reviewed waiver.`
  );
}

async function runCase(providerName: JobMatchAiProvider, c: EvalCase): Promise<EvalCaseResult> {
  const failures: string[] = [];

  const versionFailure = assertPromptVersionCurrent(c, EVALUATION_PROMPT_VERSION);
  if (versionFailure) failures.push(versionFailure);

  const profileText = buildEmbeddingInput(c.profile).text;
  const postingText = c.posting.description.replace(/\s+/g, " ").trim();
  const prompt = renderEvaluatePrompt(profileText, postingText);
  const provider = await getEvaluationProvider(providerName);

  const call = {
    profileText,
    postingText: prompt.postingTextUsed,
    system: prompt.system,
    user: prompt.user,
    promptVersion: prompt.version,
    model: provider.name,
  };

  const t0 = Date.now();
  const a = await provider.generate(call);
  const latencyMs = Date.now() - t0;
  // Determinism check (issue requirement): run the case twice through the
  // same provider and assert identical MatchResult output.
  const b = await provider.generate(call);
  const consistent = JSON.stringify(a.result) === JSON.stringify(b.result);
  if (!consistent) failures.push("non-deterministic output for identical input");

  const result = a.result;

  if (result.recommendedAction !== c.expectedRecommendedAction) {
    failures.push(`recommendedAction "${result.recommendedAction}" !== expected "${c.expectedRecommendedAction}"`);
  }
  const [min, max] = c.scoreBand;
  if (result.suitabilityScore < min || result.suitabilityScore > max) {
    failures.push(`suitabilityScore ${result.suitabilityScore.toFixed(3)} outside band [${min}, ${max}]`);
  }
  if (a.costUsd !== 0 && providerName === "fixture") {
    failures.push(`fixture provider reported non-zero cost: $${a.costUsd}`);
  }

  return {
    id: c.id,
    category: c.category,
    pass: failures.length === 0,
    failures,
    metrics: {
      suitabilityScore: result.suitabilityScore,
      confidence: result.confidence,
      recommendedAction: result.recommendedAction,
      costUsd: a.costUsd,
      latencyMs,
      consistent,
    },
  };
}

export async function runEvalSuite(providerName: JobMatchAiProvider = "fixture"): Promise<EvalReport> {
  const results: EvalCaseResult[] = [];
  for (const c of EVAL_CASES) results.push(await runCase(providerName, c));
  return {
    provider: providerName,
    promptVersion: EVALUATION_PROMPT_VERSION,
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    totalCostUsd: results.reduce((sum, r) => sum + r.metrics.costUsd, 0),
    results,
  };
}
