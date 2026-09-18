import type { RewriteProvider, RewriteProviderCall, RewriteProviderOutput } from "../provider";

/** Real Anthropic rewrite adapter — intentionally unimplemented, matching
 *  the same stub posture as the tailoring/extraction Anthropic adapters. */
export class AnthropicRewriteProvider implements RewriteProvider {
  readonly name = "anthropic";

  async rewrite(_call: RewriteProviderCall): Promise<RewriteProviderOutput> {
    throw new Error(
      "Anthropic rewriting is not implemented yet. Set RESUMATCH_AI_PROVIDER=fixture or openai, " +
        "or implement this adapter before selecting RESUMATCH_AI_PROVIDER=anthropic.",
    );
  }
}
