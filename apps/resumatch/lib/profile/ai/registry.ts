import type { ResuMatchAiProvider } from "../../env";
import type { RewriteProvider } from "./provider";
import { createProviderRegistry } from "../../ai/providerRegistry";

export { REWRITE_PROMPT_VERSION } from "./prompts";

export const REWRITE_MODEL_VERSIONS: Record<ResuMatchAiProvider, string> = {
  fixture: "fixture-rewrite-1",
  openai: "gpt-4o-mini",
  anthropic: "anthropic-rewrite-unconfigured",
};

export const getRewriteProvider = createProviderRegistry<RewriteProvider>({
  label: "rewrite",
  loaders: {
    fixture: async () => {
      const { RewriteFixtureProvider } = await import("./providers/fixture");
      return new RewriteFixtureProvider();
    },
    openai: async () => {
      const { OpenAiRewriteProvider } = await import("./providers/openai");
      return new OpenAiRewriteProvider();
    },
    anthropic: async () => {
      const { AnthropicRewriteProvider } = await import("./providers/anthropic");
      return new AnthropicRewriteProvider();
    },
  },
});
