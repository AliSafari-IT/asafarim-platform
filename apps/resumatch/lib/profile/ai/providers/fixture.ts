import type { RewriteProvider, RewriteProviderCall, RewriteProviderOutput } from "../provider";

/**
 * Deterministic, offline rewrite provider — mirrors the role of
 * lib/tailoring/ai/providers/fixture.ts and
 * lib/extraction/ai/providers/fixture.ts: zero cost, no network, the only
 * provider CI or the test suite ever exercises.
 *
 * Rewording requires generating new wording, which a fixture — by
 * definition never inventing wording — cannot honestly do. So this
 * returns the candidate's own text unchanged. Locally, with
 * `RESUMATCH_AI_PROVIDER=fixture` (the default everywhere), the "Rewrite"
 * control is expected to preview identical text — the caller
 * (lib/profile/ai/degraded.ts) marks this outcome `degraded: true` so the
 * UI can say so, rather than presenting a no-op as if it were a genuine
 * suggestion.
 */
export class RewriteFixtureProvider implements RewriteProvider {
  readonly name = "fixture";

  async rewrite(call: RewriteProviderCall): Promise<RewriteProviderOutput> {
    return {
      text: call.currentSummary,
      inputTokens: Math.ceil(call.currentSummary.length / 4),
      outputTokens: Math.ceil(call.currentSummary.length / 4),
      costUsd: 0,
    };
  }
}
