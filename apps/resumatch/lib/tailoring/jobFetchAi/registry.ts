import type { ResuMatchAiProvider } from "../../env";
import type { JobFetchProvider } from "./provider";
import { createProviderRegistry } from "../../ai/providerRegistry";

export { FETCH_JOB_PROMPT_VERSION } from "./prompts";

/** `openai` names a real model with web-search tool access. `fixture`
 *  doesn't call a model at all — see providers/fixture.ts. */
export const FETCH_JOB_MODEL_VERSIONS: Record<ResuMatchAiProvider, string> = {
  fixture: "fixture-fetch-job-1",
  openai: "gpt-4o-mini",
  anthropic: "anthropic-fetch-job-unconfigured",
};

export const getJobFetchProvider = createProviderRegistry<JobFetchProvider>({
  label: "job-fetch",
  loaders: {
    fixture: async () => {
      const { JobFetchFixtureProvider } = await import("./providers/fixture");
      return new JobFetchFixtureProvider();
    },
    openai: async () => {
      const { OpenAiJobFetchProvider } = await import("./providers/openai");
      return new OpenAiJobFetchProvider();
    },
    anthropic: async () => {
      const { AnthropicJobFetchProvider } = await import("./providers/anthropic");
      return new AnthropicJobFetchProvider();
    },
  },
});
