import type { ResuMatchAiProvider } from "../../../env";
import type { CategorizeSkillsProvider } from "./provider";
import { createProviderRegistry } from "../../../ai/providerRegistry";

export { CATEGORIZE_PROMPT_VERSION } from "./prompts";

export const CATEGORIZE_MODEL_VERSIONS: Record<ResuMatchAiProvider, string> = {
  fixture: "fixture-categorize-1",
  openai: process.env.OPENAI_MODEL || "gpt-4o-mini",
  anthropic: "anthropic-categorize-unconfigured",
};

export const getCategorizeSkillsProvider = createProviderRegistry<CategorizeSkillsProvider>({
  label: "categorize-skills",
  loaders: {
    fixture: async () => {
      const { CategorizeSkillsFixtureProvider } = await import("./providers/fixture");
      return new CategorizeSkillsFixtureProvider();
    },
    openai: async () => {
      const { OpenAiCategorizeSkillsProvider } = await import("./providers/openai");
      return new OpenAiCategorizeSkillsProvider();
    },
    anthropic: async () => {
      const { AnthropicCategorizeSkillsProvider } = await import("./providers/anthropic");
      return new AnthropicCategorizeSkillsProvider();
    },
  },
});
