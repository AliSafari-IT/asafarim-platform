import { logError } from "../../observability/logger";
import { buildDegradedMatchResult, type MatchResult } from "../contract";
import { QuotaExceededError } from "./quota";

/**
 * Degraded-mode wiring (JM-047).
 *
 * The single funnel every MatchResult-producing call site should go through:
 * budget exhaustion, retries exhausted, or no provider configured all end up
 * here, and all of them produce `buildDegradedMatchResult` (lib/matching/
 * contract.ts) -- never a silent skip, never a fabricated score. This is the
 * plug point JM-043 (the real LLM evaluation step, not built yet) wraps its
 * `evaluate()` call in.
 *
 * **Why this does not also wrap the embedding step.** The embedding compute
 * path (lib/matching/ai/embeddingCache.ts) has its own honest failure mode
 * already: `embedWithRetry` retries a bounded number of times and then
 * re-throws, and `ensureProfileEmbedding`/`ensurePostingEmbedding` return
 * `Promise<EnsuredEmbedding | null>` -- there is no `MatchResult` at that
 * layer to degrade *into*. Wrapping it here and swallowing the error into a
 * fake `EnsuredEmbedding` would be the same "silent skip" the issue is
 * explicit about never doing, just one layer lower. Budget exhaustion is
 * still checked before every embed call (see `assertCanRunProviderCall` wired
 * into `embeddingCache.ts`'s `ensureEmbeddingRow`) and still throws
 * (`QuotaExceededError`) rather than degrading silently -- it is the
 * *caller* that must decide what an embedding failure means for the
 * MatchResult it is trying to produce, and today (pre-JM-043) nothing calls
 * embeddingCache and rank() together to produce one, so there is no real
 * caller to wire this into yet. `runOrDegrade` below is what that caller,
 * and JM-043's evaluate() call, should use once they exist.
 */
export async function runOrDegrade(
  promptVersion: string,
  kind: "embed" | "evaluate",
  fn: () => Promise<MatchResult>,
): Promise<MatchResult> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      logError("matching.degraded.budget_exhausted", error, { kind, reason: error.reason });
      return buildDegradedMatchResult(promptVersion);
    }
    logError("matching.degraded.provider_call_failed", error, { kind });
    return buildDegradedMatchResult(promptVersion);
  }
}
