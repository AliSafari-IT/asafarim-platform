import {
  SkillsParagraphProviderError,
  type SkillsParagraphProvider,
  type SkillsParagraphProviderCall,
  type SkillsParagraphProviderOutput,
} from "../provider";

/** Real Anthropic adapter — intentionally unimplemented, matching the stub
 *  posture of the rewrite and categorize Anthropic adapters. */
export class AnthropicSkillsParagraphProvider implements SkillsParagraphProvider {
  readonly name = "anthropic";

  async write(_call: SkillsParagraphProviderCall): Promise<SkillsParagraphProviderOutput> {
    throw new SkillsParagraphProviderError(
      "Anthropic skills paragraphs are not implemented yet. Set RESUMATCH_AI_PROVIDER=fixture or openai, " +
        "or implement this adapter before selecting RESUMATCH_AI_PROVIDER=anthropic.",
      false,
    );
  }
}
