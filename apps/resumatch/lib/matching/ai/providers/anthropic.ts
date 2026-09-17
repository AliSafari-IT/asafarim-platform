/**
 * Real Anthropic embeddings adapter — intentionally unimplemented (JM-041).
 *
 * Same posture as ./openai.ts: out of scope for this issue, reachable only
 * behind `JOBMATCH_AI_PROVIDER=anthropic`, itself gated by JM-005 sign-off
 * in any deployed environment (lib/env.ts). Never imported by CI or the
 * fixture-only test suite.
 */
export async function anthropicEmbed(_texts: string[]): Promise<number[][]> {
  throw new Error(
    "Anthropic embeddings are not implemented yet. Set JOBMATCH_AI_PROVIDER=fixture, " +
      "or implement this adapter before selecting JOBMATCH_AI_PROVIDER=anthropic.",
  );
}
