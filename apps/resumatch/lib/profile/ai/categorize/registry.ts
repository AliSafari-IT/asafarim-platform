import type { ResuMatchAiProvider } from "../../../env";
import type { CategorizeSkillsProvider } from "./provider";

export { CATEGORIZE_PROMPT_VERSION } from "./prompts";

export const CATEGORIZE_MODEL_VERSIONS: Record<ResuMatchAiProvider, string> = {
  fixture: "fixture-categorize-1",
  openai: process.env.OPENAI_MODEL || "gpt-4o-mini",
  anthropic: "anthropic-categorize-unconfigured",
};

const categorizeProviderCache = new Map<string, CategorizeSkillsProvider>();

export async function getCategorizeSkillsProvider(name: ResuMatchAiProvider): Promise<CategorizeSkillsProvider> {
  const cached = categorizeProviderCache.get(name);
  if (cached) return cached;

  let provider: CategorizeSkillsProvider;
  switch (name) {
    case "fixture": {
      const { CategorizeSkillsFixtureProvider } = await import("./providers/fixture");
      provider = new CategorizeSkillsFixtureProvider();
      break;
    }
    case "openai": {
      const { OpenAiCategorizeSkillsProvider } = await import("./providers/openai");
      provider = new OpenAiCategorizeSkillsProvider();
      break;
    }
    case "anthropic": {
      const { AnthropicCategorizeSkillsProvider } = await import("./providers/anthropic");
      provider = new AnthropicCategorizeSkillsProvider();
      break;
    }
    default:
      throw new Error(`unknown ResuMatch categorize-skills provider: ${name as string}`);
  }
  categorizeProviderCache.set(name, provider);
  return provider;
}
