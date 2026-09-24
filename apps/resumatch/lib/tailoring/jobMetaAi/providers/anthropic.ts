import { JobMetaProviderError } from "../provider";
import type { JobMetaProvider, JobMetaProviderCall, JobMetaProviderOutput } from "../provider";

/** Real Anthropic job-meta adapter — intentionally unimplemented, matching
 *  the same stub posture as every other Anthropic adapter in this app. */
export class AnthropicJobMetaProvider implements JobMetaProvider {
  readonly name = "anthropic";

  async infer(_call: JobMetaProviderCall): Promise<JobMetaProviderOutput> {
    throw new JobMetaProviderError(
      "Anthropic job-meta inference is not implemented yet. Set RESUMATCH_AI_PROVIDER=fixture or openai, " +
        "or implement this adapter before selecting RESUMATCH_AI_PROVIDER=anthropic.",
      false,
    );
  }
}
