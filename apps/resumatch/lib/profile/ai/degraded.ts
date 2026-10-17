import { logError } from "../../observability/logger";
import { getEnv, type ResuMatchAiProvider, type ResuMatchRealAiProvider } from "../../env";
import { recordBilledFailure, settleProviderCall, QuotaExceededError } from "../../tailoring/ai/quota";
import { runProviderCallWithBudget } from "../../ai/runProviderCall";
import { resolveFallbackProvider } from "../../ai/fallbackProvider";
import type { CostAttribution } from "../../costs/ledger";
import { renderRewritePrompt } from "./prompts";
import { RewriteProviderError, type SummaryTone } from "./provider";
import { REWRITE_MODEL_VERSIONS, getRewriteProvider } from "./registry";
import { parseRewriteOutput } from "./schema";

/**
 * Degraded-mode wiring for the summary write/rewrite call. Mirrors
 * lib/tailoring/ai/degraded.ts and lib/extraction/ai/degraded.ts: budget
 * exhaustion, retries exhausted, or a response that fails schema
 * validation all fall back to the candidate's own current text, unchanged
 * — never a 500, never a silently blanked-out summary.
 */

export interface RewriteOutcome {
  text: string;
  /** True when nothing was actually rewritten — either because
   *  `RESUMATCH_AI_PROVIDER=fixture` (the default everywhere) returns the
   *  input unchanged by design, or because a real provider call failed.
   *  The caller (the API route) surfaces this so the UI can say a rewrite
   *  did not really happen, rather than presenting the original text back
   *  as if it were a fresh suggestion. */
  degraded: boolean;
}

export interface RewriteSummaryInput {
  /** Current Summary field; empty means "write one from the profile". */
  currentSummary: string;
  /** Allow-listed profile text from `buildProfileText`, summary left out. */
  profileText: string;
  tone: SummaryTone;
  /** Optional free-text request from the candidate. */
  instructions?: string;
}

export async function rewriteSummaryWithFallback(
  workspaceId: string,
  input: RewriteSummaryInput,
  opts: {
    provider?: ResuMatchAiProvider;
    /** Issue #511: overrides `RESUMATCH_AI_FALLBACK_PROVIDER`; null = none. */
    fallbackProvider?: ResuMatchRealAiProvider | null;
  } = {},
): Promise<RewriteOutcome> {
  const { currentSummary, tone } = input;
  const aiProvider = opts.provider ?? getEnv().aiProvider;
  // The profile is 1:1 with the workspace and may not have a row yet when
  // a summary is rewritten, so the workspace id keys it (issue #586).
  const attribution: CostAttribution = { subjectType: "candidate_profile", subjectId: workspaceId };

  if (aiProvider === "fixture") return { text: currentSummary, degraded: true };
  const fallbackName = resolveFallbackProvider(aiProvider, opts.fallbackProvider);

  const result = await runProviderCallWithBudget({
    workspaceId,
    kind: "rewrite",
    prepare: async () => ({
      provider: await getRewriteProvider(aiProvider),
      name: aiProvider,
      modelVersion: REWRITE_MODEL_VERSIONS[aiProvider],
      prompt: renderRewritePrompt(input),
    }),
    // Issue #511: the same prompt, served by the other provider.
    fallback: fallbackName
      ? {
          prepare: async () => ({
            provider: await getRewriteProvider(fallbackName),
            name: fallbackName,
            modelVersion: REWRITE_MODEL_VERSIONS[fallbackName],
            prompt: renderRewritePrompt(input),
          }),
        }
      : null,
    call: async ({ provider, name, modelVersion, prompt }) => {
      const started = Date.now();
      const output = await provider.rewrite({
        currentSummary,
        tone,
        system: prompt.system,
        user: prompt.user,
        promptVersion: prompt.version,
        model: modelVersion,
      });

      // A malformed or empty response is a failed call, not something to
      // salvage — thrown here so it degrades below. Never retried: the
      // same malformed shape would recur against the same input.
      const text = await settleProviderCall(
        {
          workspaceId,
          kind: "rewrite",
          provider: name,
          model: modelVersion,
          promptVersion: prompt.version,
          inputTokens: output.inputTokens,
          outputTokens: output.outputTokens,
          meta: output,
          latencyMs: Date.now() - started,
          attribution,
        },
        () => parseRewriteOutput(output.text),
      );

      return { text, degraded: false };
    },
    onAttemptFailed: async (err, { name, modelVersion, prompt }, attempt) => {
      await recordBilledFailure(err, { workspaceId, kind: "rewrite", provider: name, model: modelVersion, promptVersion: prompt.version, attribution });
      logError("profile.rewrite.provider_call_failed", err, { workspaceId, attempt, provider: name });
    },
    isRetryable: (err) => (err instanceof RewriteProviderError ? err.retryable : false),
  });
  if (result.ok) return result.value;

  if (result.error instanceof QuotaExceededError) {
    logError("profile.rewrite.degraded.budget_exhausted", result.error, { workspaceId, reason: result.error.reason });
  } else {
    logError("profile.rewrite.degraded.provider_call_failed", result.error, { workspaceId });
  }
  return { text: currentSummary, degraded: true };
}
