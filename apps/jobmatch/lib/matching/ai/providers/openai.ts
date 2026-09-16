/**
 * Real OpenAI embeddings adapter — intentionally unimplemented (JM-041).
 *
 * This issue's scope is the fixture provider, the content-hash cache, and
 * the GDPR erasure wiring; a real network-calling adapter is explicitly out
 * of scope. Reaching this file at all requires `JOBMATCH_AI_PROVIDER=openai`,
 * which is itself refused in any deployed environment until the JM-005
 * sign-off gate is satisfied (lib/env.ts). Nothing in CI, `pnpm test`, or the
 * fixture-only test suite ever imports this module.
 */
export async function openaiEmbed(_texts: string[]): Promise<number[][]> {
  throw new Error(
    "OpenAI embeddings are not implemented yet. Set JOBMATCH_AI_PROVIDER=fixture, " +
      "or implement this adapter before selecting JOBMATCH_AI_PROVIDER=openai.",
  );
}
