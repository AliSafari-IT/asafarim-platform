import type { ResuMatchAiProvider } from "../../../env";
import type { SkillsParagraphProvider } from "./provider";
import { createProviderRegistry } from "../../../ai/providerRegistry";

export { SKILLS_PARAGRAPH_PROMPT_VERSION } from "./prompts";

export const SKILLS_PARAGRAPH_MODEL_VERSIONS: Record<ResuMatchAiProvider, string> = {
  fixture: "fixture-skills-paragraph-1",
  openai: process.env.OPENAI_MODEL || "gpt-4o-mini",
  anthropic: "anthropic-skills-paragraph-unconfigured",
};

export const getSkillsParagraphProvider = createProviderRegistry<SkillsParagraphProvider>({
  label: "skills-paragraph",
  loaders: {
    fixture: async () => {
      const { SkillsParagraphFixtureProvider } = await import("./providers/fixture");
      return new SkillsParagraphFixtureProvider();
    },
    openai: async () => {
      const { OpenAiSkillsParagraphProvider } = await import("./providers/openai");
      return new OpenAiSkillsParagraphProvider();
    },
    anthropic: async () => {
      const { AnthropicSkillsParagraphProvider } = await import("./providers/anthropic");
      return new AnthropicSkillsParagraphProvider();
    },
  },
});
