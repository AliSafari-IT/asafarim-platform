import type { ResuMatchAiProvider } from "../../../env";
import { createProviderRegistry } from "../../../ai/providerRegistry";
import type { FitProvider } from "./provider";

export { JOB_FIT_PROMPT_VERSION } from "./prompts";

export const FIT_MODEL_VERSIONS: Record<ResuMatchAiProvider, string> = {
  fixture: "fixture-job-fit-1",
  openai: process.env.OPENAI_MODEL || "gpt-4o-mini",
  anthropic: "anthropic-job-fit-unconfigured",
};

export const getFitProvider = createProviderRegistry<FitProvider>({
  label: "job-fit",
  loaders: {
    fixture: async () => {
      const { FitFixtureProvider } = await import("./providers/fixture");
      return new FitFixtureProvider();
    },
    openai: async () => {
      const { OpenAiFitProvider } = await import("./providers/openai");
      return new OpenAiFitProvider();
    },
    anthropic: async () => {
      const { AnthropicFitProvider } = await import("./providers/anthropic");
      return new AnthropicFitProvider();
    },
  },
});
