import { CategorizeSkillsProviderError } from "../provider";
import type {
  CategorizeSkillsProvider,
  CategorizeSkillsProviderCall,
  CategorizeSkillsProviderOutput,
} from "../provider";

/** Real Anthropic categorize adapter — intentionally unimplemented,
 *  matching the same stub posture as the tailoring/rewrite/extraction
 *  Anthropic adapters elsewhere in this app. */
export class AnthropicCategorizeSkillsProvider implements CategorizeSkillsProvider {
  readonly name = "anthropic";

  async categorize(_call: CategorizeSkillsProviderCall): Promise<CategorizeSkillsProviderOutput> {
    throw new CategorizeSkillsProviderError(
      "Anthropic skill categorization is not implemented yet. Set RESUMATCH_AI_PROVIDER=fixture or openai, " +
        "or implement this adapter before selecting RESUMATCH_AI_PROVIDER=anthropic.",
      false,
    );
  }
}
