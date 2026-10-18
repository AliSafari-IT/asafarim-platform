import type { ResuMatchAiProvider } from "../../env";
import type { JobMetaProvider } from "./provider";
import { createProviderRegistry } from "../../ai/providerRegistry";

export { JOB_META_PROMPT_VERSION } from "./prompts";

export const JOB_META_MODEL_VERSIONS: Record<ResuMatchAiProvider, string> = {
  fixture: "fixture-job-meta-1",
  openai: process.env.OPENAI_MODEL || "gpt-4o-mini",
  anthropic: "anthropic-job-meta-unconfigured",
};

export const getJobMetaProvider = createProviderRegistry<JobMetaProvider>({
  label: "job-meta",
  loaders: {
    fixture: async () => {
      const { JobMetaFixtureProvider } = await import("./providers/fixture");
      return new JobMetaFixtureProvider();
    },
    openai: async () => {
      const { OpenAiJobMetaProvider } = await import("./providers/openai");
      return new OpenAiJobMetaProvider();
    },
    anthropic: async () => {
      const { AnthropicJobMetaProvider } = await import("./providers/anthropic");
      return new AnthropicJobMetaProvider();
    },
  },
});
