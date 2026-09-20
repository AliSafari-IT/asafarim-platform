import type { ResuMatchAiProvider } from "../../env";
import type { JobMetaProvider } from "./provider";

export { JOB_META_PROMPT_VERSION } from "./prompts";

export const JOB_META_MODEL_VERSIONS: Record<ResuMatchAiProvider, string> = {
  fixture: "fixture-job-meta-1",
  openai: process.env.OPENAI_MODEL || "gpt-4o-mini",
  anthropic: "anthropic-job-meta-unconfigured",
};

const jobMetaProviderCache = new Map<string, JobMetaProvider>();

export async function getJobMetaProvider(name: ResuMatchAiProvider): Promise<JobMetaProvider> {
  const cached = jobMetaProviderCache.get(name);
  if (cached) return cached;

  let provider: JobMetaProvider;
  switch (name) {
    case "fixture": {
      const { JobMetaFixtureProvider } = await import("./providers/fixture");
      provider = new JobMetaFixtureProvider();
      break;
    }
    case "openai": {
      const { OpenAiJobMetaProvider } = await import("./providers/openai");
      provider = new OpenAiJobMetaProvider();
      break;
    }
    case "anthropic": {
      const { AnthropicJobMetaProvider } = await import("./providers/anthropic");
      provider = new AnthropicJobMetaProvider();
      break;
    }
    default:
      throw new Error(`unknown ResuMatch job-meta provider: ${name as string}`);
  }
  jobMetaProviderCache.set(name, provider);
  return provider;
}
