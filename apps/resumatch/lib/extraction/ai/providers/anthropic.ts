import type { ExtractionProvider, ExtractionProviderCall, ExtractionProviderOutput } from "../provider";

/**
 * Real Anthropic extraction adapter — intentionally unimplemented for this
 * milestone. See ./openai.ts's doc comment for the reachability/gating
 * story; same posture, different provider. Out of scope per issue #417 —
 * add a real implementation only once there's a reason to prioritize a
 * second provider over the one already working.
 */
export class AnthropicExtractionProvider implements ExtractionProvider {
  readonly name = "anthropic";

  async extract(_call: ExtractionProviderCall): Promise<ExtractionProviderOutput> {
    throw new Error(
      "Anthropic extraction is not implemented yet. Set RESUMATCH_AI_PROVIDER=fixture or openai, " +
        "or implement this adapter before selecting RESUMATCH_AI_PROVIDER=anthropic.",
    );
  }
}
