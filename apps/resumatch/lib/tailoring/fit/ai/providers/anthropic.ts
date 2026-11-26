import { FitProviderError, type FitProvider, type FitProviderCall, type FitProviderOutput } from "../provider";

/** Intentionally unimplemented, like every other Anthropic adapter here. */
export class AnthropicFitProvider implements FitProvider {
  readonly name = "anthropic";

  async analyze(_call: FitProviderCall): Promise<FitProviderOutput> {
    throw new FitProviderError(
      "Anthropic job fit analysis is not implemented yet. Set RESUMATCH_AI_PROVIDER=fixture or openai.",
      false,
      "unavailable",
    );
  }
}
