import { getJobmatchDb } from "../../db/client";
import { getEnv } from "../../env";
import { logError } from "../../observability/logger";
import { getVersion } from "../../profile/versions";
import { buildEmbeddingInput } from "../embeddingInput";
import { buildDegradedMatchResult, parseMatchResult, type MatchResult } from "../contract";
import { embeddingTextForPosting } from "./embeddingCache";
import { renderEvaluatePrompt } from "./prompts";
import { getCachedMatchRun, recordMatchRun } from "./matchRunCache";
import { assertCanRunProviderCall, recordUsage, QuotaExceededError } from "./quota";
import { getEvaluationProvider, EVALUATION_MODEL_VERSIONS } from "./registry";
import { EvaluationProviderError } from "./evaluateProvider";

/**
 * The structured LLM evaluation pipeline (JM-043). Mirrors
 * apps/tasks-ai/lib/ai/job.ts's `runAiJob` sequence step for step, adapted:
 *
 *   budget/quota check
 *     -> assemble input (buildEmbeddingInput(profile).text + fenced posting)
 *     -> render versioned prompt (match_evaluate@1)
 *     -> cache lookup (JM-047's MatchRun key)
 *     -> provider call (retry x3, on exhaustion -> buildDegradedMatchResult)
 *     -> parseMatchResult() guard (JobMatch's equivalent of tasks-ai's
 *        guardDraft()) -- a schema-invalid provider response is a hard
 *        failure, no MatchRun written
 *     -> persist MatchRun (recordMatchRun) + AiUsageLedger row (recordUsage)
 *
 * **Input boundary.** `profileText` below is ALWAYS
 * `buildEmbeddingInput(profile).text` -- see lib/matching/embeddingInput.ts's
 * own module doc comment on why that function is the only approved source
 * of profile text reaching any provider call. This module never reads a raw
 * `CandidateProfileContent` field directly into a prompt. `postingText` is
 * the same normalisation `ensurePostingEmbedding` already uses
 * (`embeddingTextForPosting`, embeddingCache.ts), so the text a posting was
 * embedded with and the text it is evaluated against never diverge.
 *
 * **Schema failure vs. degraded mode -- NOT the same code path.** A
 * provider that throws (`EvaluationProviderError`, a network error, a
 * timeout) exhausts its retries and THEN degrades via
 * `buildDegradedMatchResult` -- see the retry loop below. A provider that
 * *returns* a response but that response fails `parseMatchResult()` is a
 * completely different branch: that `try/catch` is scoped ONLY around
 * `parseMatchResult(rawResult)`, outside the retry loop, and on failure it
 * rethrows immediately without calling `recordMatchRun` or
 * `buildDegradedMatchResult` at all -- the job fails outright, per the
 * issue's explicit acceptance criterion ("a provider response that fails
 * the schema fails the job, no MatchRun written").
 */
export interface EvaluateMatchOptions {
  /** Override the provider selection (tests only) — defaults to
   *  `getEnv().aiEvalProvider` (JOBMATCH_AI_EVAL_PROVIDER). */
  provider?: "fixture" | "openai" | "anthropic";
}

const MAX_ATTEMPTS = 3;

export async function evaluateMatch(
  workspaceId: string,
  profileVersionId: string,
  postingId: string,
  opts: EvaluateMatchOptions = {},
): Promise<MatchResult> {
  const db = getJobmatchDb();
  const { aiEvalProvider } = getEnv();
  const providerName = opts.provider ?? aiEvalProvider;
  const evaluationModelVersion = EVALUATION_MODEL_VERSIONS[providerName];

  // Assemble input. Resolved before the budget check so a not-found version
  // or posting fails with a clear error rather than a confusing quota one.
  const version = await getVersion(workspaceId, profileVersionId);
  if (!version) {
    throw new Error(`evaluateMatch: profile version ${profileVersionId} not found in workspace ${workspaceId}`);
  }
  const posting = await db.jobPosting.findUnique({
    where: { id: postingId },
    select: { description: true },
  });
  if (!posting) {
    throw new Error(`evaluateMatch: job posting ${postingId} not found`);
  }

  const profileText = buildEmbeddingInput(version.content).text;
  const postingText = embeddingTextForPosting(posting.description);

  const prompt = renderEvaluatePrompt(profileText, postingText);

  // Cache lookup (JM-047) -- a hit means ZERO provider calls, and the
  // budget check below is never reached on this branch, matching
  // embeddingCache.ts's "cache hit skips the quota guard entirely" rule:
  // a workspace already at its budget must still be able to reuse an
  // evaluation it already paid for.
  const cacheKey = {
    workspaceId,
    profileVersionId,
    postingId,
    promptVersion: prompt.version,
    evaluationModelVersion,
  };
  const cached = await getCachedMatchRun(cacheKey);
  if (cached) return cached;

  // Budget/quota check -- before the first provider call, same discipline
  // as embeddingCache.ts's ensureEmbeddingRow. A QuotaExceededError here
  // degrades rather than throws to the worker (see catch below).
  try {
    await assertCanRunProviderCall(workspaceId, "evaluate");
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      logError("matching.evaluate.budget_exhausted", err, { workspaceId, postingId });
      const degraded = buildDegradedMatchResult(prompt.version);
      await recordMatchRun(cacheKey, degraded, 0);
      return degraded;
    }
    throw err;
  }

  const provider = await getEvaluationProvider(providerName);

  let rawResult: MatchResult | null = null;
  let costUsd = 0;
  let degraded = false;

  for (let attempt = 1; ; attempt++) {
    try {
      const output = await provider.generate({
        profileText,
        postingText: prompt.postingTextUsed,
        system: prompt.system,
        user: prompt.user,
        promptVersion: prompt.version,
        model: evaluationModelVersion,
      });
      rawResult = output.result;
      costUsd = output.costUsd;
      await recordUsage({
        workspaceId,
        kind: "evaluate",
        provider: providerName,
        model: evaluationModelVersion,
        promptVersion: prompt.version,
        inputTokens: output.inputTokens,
        outputTokens: output.outputTokens,
        costUsd: output.costUsd,
      });
      break;
    } catch (err) {
      const retryable = err instanceof EvaluationProviderError ? err.retryable : true;
      logError("matching.evaluate.provider_call_failed", err, { workspaceId, postingId, attempt, provider: providerName });
      if (attempt >= MAX_ATTEMPTS || !retryable) {
        // Retries exhausted (or a non-retryable error): degrade, per the
        // issue's "on exhaustion -> buildDegradedMatchResult" step. This is
        // the ONLY place a provider failure produces a degraded result --
        // a schema failure below is handled separately and never lands
        // here.
        degraded = true;
        rawResult = buildDegradedMatchResult(prompt.version);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }

  if (degraded) {
    // Degraded results are still cached and ledgered (cost 0) so a repeat
    // call for the same key does not re-attempt a provider that is known
    // to be failing right now within this cache window.
    await recordMatchRun(cacheKey, rawResult as MatchResult, 0);
    return rawResult as MatchResult;
  }

  // parseMatchResult() guard -- JobMatch's equivalent of tasks-ai's
  // guardDraft(). Deliberately OUTSIDE the retry loop and in its own
  // try/catch with no fallback: a schema-invalid response is a hard
  // failure of the job, never silently degraded and never persisted. This
  // is the exact behaviour the issue's acceptance criterion requires ("a
  // provider response that fails the schema fails the job, no MatchRun
  // written").
  let guarded: MatchResult;
  try {
    guarded = parseMatchResult(rawResult);
  } catch (err) {
    logError("matching.evaluate.schema_guard_failed", err, { workspaceId, postingId, provider: providerName });
    throw err;
  }

  await recordMatchRun(cacheKey, guarded, costUsd);
  return guarded;
}
