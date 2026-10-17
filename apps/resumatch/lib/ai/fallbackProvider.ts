import {
  getEnv,
  type ResuMatchAiProvider,
  type ResuMatchRealAiProvider,
} from "../env";

/**
 * Which provider, if any, a call falls back to once its primary's retries
 * are exhausted on a retryable error (issue #511). `null` means no
 * fallback: the primary is `fixture` (fixtures are the single-provider case
 * for tests and CI), none is configured, or it would be the primary again.
 *
 * `override` is for tests and callers that pick the provider themselves:
 * `undefined` reads `RESUMATCH_AI_FALLBACK_PROVIDER`, `null` turns the
 * fallback off for this call.
 */
export function resolveFallbackProvider(
  primary: ResuMatchAiProvider,
  override?: ResuMatchRealAiProvider | null
): ResuMatchRealAiProvider | null {
  if (primary === "fixture") return null;
  const configured =
    override !== undefined ? override : (getEnv().aiFallbackProvider ?? null);
  return configured !== null && configured !== primary ? configured : null;
}
