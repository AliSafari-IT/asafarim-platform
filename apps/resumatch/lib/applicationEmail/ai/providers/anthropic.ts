import {
  ApplicationEmailProviderError,
  type ApplicationEmailProvider,
  type ApplicationEmailProviderCall,
  type ApplicationEmailProviderOutput,
} from "../provider";

/** Intentionally unimplemented, like the other Anthropic stubs in this app. */
export class AnthropicApplicationEmailProvider implements ApplicationEmailProvider {
  readonly name = "anthropic";

  async generate(_call: ApplicationEmailProviderCall): Promise<ApplicationEmailProviderOutput> {
    throw new ApplicationEmailProviderError(
      "Anthropic application emails are not implemented yet. Set RESUMATCH_AI_PROVIDER=fixture or openai.",
      false,
    );
  }
}
