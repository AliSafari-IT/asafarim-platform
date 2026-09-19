import type { ResuMatchAiProvider } from "../../env";
import type { JobFetchProvider } from "./provider";

export { FETCH_JOB_PROMPT_VERSION } from "./prompts";

/** `openai` names a real model with web-search tool access. `fixture`
 *  doesn't call a model at all — see providers/fixture.ts. */
export const FETCH_JOB_MODEL_VERSIONS: Record<ResuMatchAiProvider, string> = {
  fixture: "fixture-fetch-job-1",
  openai: "gpt-4o-mini",
  anthropic: "anthropic-fetch-job-unconfigured",
};

const jobFetchProviderCache = new Map<string, JobFetchProvider>();

export async function getJobFetchProvider(name: ResuMatchAiProvider): Promise<JobFetchProvider> {
  const cached = jobFetchProviderCache.get(name);
  if (cached) return cached;

  let provider: JobFetchProvider;
  switch (name) {
    case "fixture": {
      const { JobFetchFixtureProvider } = await import("./providers/fixture");
      provider = new JobFetchFixtureProvider();
      break;
    }
    case "openai": {
      const { OpenAiJobFetchProvider } = await import("./providers/openai");
      provider = new OpenAiJobFetchProvider();
      break;
    }
    case "anthropic": {
      const { AnthropicJobFetchProvider } = await import("./providers/anthropic");
      provider = new AnthropicJobFetchProvider();
      break;
    }
    default:
      throw new Error(`unknown ResuMatch job-fetch provider: ${name as string}`);
  }
  jobFetchProviderCache.set(name, provider);
  return provider;
}
