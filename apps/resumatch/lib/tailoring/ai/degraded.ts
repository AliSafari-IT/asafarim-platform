import { logError } from "../../observability/logger";
import type { CandidateProfileContent } from "../../profile/contract";
import { mergeTailoringSuggestions, type TailoredResumeContent } from "./schema";
import { QuotaExceededError } from "./quota";

/**
 * Degraded-mode wiring. Mirrors the old matching product's
 * `lib/matching/ai/degraded.ts` (deleted with the pivot): the single funnel
 * every tailoring call site should go through — budget exhaustion, retries
 * exhausted, or no provider configured all end up here, and all of them
 * produce the profile carried over unchanged (`mergeTailoringSuggestions`
 * with `suggestions: null`) — never a silent skip, never a fabricated
 * rewrite.
 */
export async function runOrDegrade(
  profile: CandidateProfileContent,
  fn: () => Promise<TailoredResumeContent>,
): Promise<{ content: TailoredResumeContent; degraded: boolean }> {
  try {
    return { content: await fn(), degraded: false };
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      logError("tailoring.degraded.budget_exhausted", error, { reason: error.reason });
    } else {
      logError("tailoring.degraded.provider_call_failed", error, {});
    }
    return { content: mergeTailoringSuggestions(profile, null), degraded: true };
  }
}
