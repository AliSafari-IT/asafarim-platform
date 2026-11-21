import type { ResuMatchAiProvider } from "../../env";
import { createProviderRegistry } from "../../ai/providerRegistry";
import type { ApplicationEmailProvider } from "./provider";

export { APPLICATION_EMAIL_PROMPT_VERSION } from "./prompts";

export const APPLICATION_EMAIL_MODEL_VERSIONS: Record<ResuMatchAiProvider, string> = {
  fixture: "fixture-application-email-1",
  openai: process.env.OPENAI_MODEL || "gpt-4o-mini",
  anthropic: "anthropic-application-email-unconfigured",
};

export const getApplicationEmailProvider = createProviderRegistry<ApplicationEmailProvider>({
  label: "application-email",
  loaders: {
    fixture: async () => {
      const { ApplicationEmailFixtureProvider } = await import("./providers/fixture");
      return new ApplicationEmailFixtureProvider();
    },
    openai: async () => {
      const { OpenAiApplicationEmailProvider } = await import("./providers/openai");
      return new OpenAiApplicationEmailProvider();
    },
    anthropic: async () => {
      const { AnthropicApplicationEmailProvider } = await import("./providers/anthropic");
      return new AnthropicApplicationEmailProvider();
    },
  },
});
