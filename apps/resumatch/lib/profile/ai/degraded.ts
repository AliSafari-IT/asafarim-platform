import { logError } from "../../observability/logger";
import { getEnv, type ResuMatchAiProvider } from "../../env";
import {
  assertCanRunProviderCall,
  recordBilledFailure,
  settleProviderCall,
  QuotaExceededError,
} from "../../tailoring/ai/quota";
import type { CostAttribution } from "../../costs/ledger";
import { renderRewritePrompt } from "./prompts";
import { RewriteProviderError, type SummaryTone } from "./provider";
import { REWRITE_MODEL_VERSIONS, getRewriteProvider } from "./registry";
import { parseRewriteOutput } from "./schema";

/**
 * Degraded-mode wiring for the summary tone-rewrite call. Mirrors
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

const MAX_ATTEMPTS = 3;

export async function rewriteSummaryWithFallback(
  workspaceId: string,
  currentSummary: string,
  tone: SummaryTone,
  opts: { provider?: ResuMatchAiProvider } = {},
): Promise<RewriteOutcome> {
  const aiProvider = opts.provider ?? getEnv().aiProvider;
  // The profile is 1:1 with the workspace and may not have a row yet when
  // a summary is rewritten, so the workspace id keys it (issue #586).
  const attribution: CostAttribution = { subjectType: "candidate_profile", subjectId: workspaceId };

  if (aiProvider === "fixture") return { text: currentSummary, degraded: true };

  try {
    await assertCanRunProviderCall(workspaceId, "rewrite");

    const provider = await getRewriteProvider(aiProvider);
    const modelVersion = REWRITE_MODEL_VERSIONS[aiProvider];
    const prompt = renderRewritePrompt(currentSummary, tone);

    for (let attempt = 1; ; attempt++) {
      try {
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
            provider: aiProvider,
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
      } catch (err) {
        await recordBilledFailure(err, { workspaceId, kind: "rewrite", provider: aiProvider, model: modelVersion, promptVersion: prompt.version, attribution });
        const retryable = err instanceof RewriteProviderError ? err.retryable : false;
        logError("profile.rewrite.provider_call_failed", err, { workspaceId, attempt, provider: aiProvider });
        if (attempt >= MAX_ATTEMPTS || !retryable) throw err;
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      }
    }
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      logError("profile.rewrite.degraded.budget_exhausted", error, { workspaceId, reason: error.reason });
    } else {
      logError("profile.rewrite.degraded.provider_call_failed", error, { workspaceId });
    }
    return { text: currentSummary, degraded: true };
  }
}
