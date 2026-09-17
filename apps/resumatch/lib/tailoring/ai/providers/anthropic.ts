import type { TailorProvider, TailorProviderCall, TailorProviderOutput } from "../provider";

/**
 * Real Anthropic tailoring adapter — intentionally unimplemented. See
 * ./openai.ts's doc comment; same posture, different provider.
 */
export class AnthropicTailorProvider implements TailorProvider {
  readonly name = "anthropic";

  async generate(_call: TailorProviderCall): Promise<TailorProviderOutput> {
    throw new Error(
      "Anthropic tailoring is not implemented yet. Set JOBMATCH_AI_PROVIDER=fixture, " +
        "or implement this adapter before selecting JOBMATCH_AI_PROVIDER=anthropic.",
    );
  }
}
