import type { JobFetchProvider, JobFetchProviderCall, JobFetchProviderOutput } from "../provider";

/** Real Anthropic job-fetch adapter — intentionally unimplemented, matching
 *  the same stub posture as this app's other Anthropic adapters. */
export class AnthropicJobFetchProvider implements JobFetchProvider {
  readonly name = "anthropic";

  async fetch(_call: JobFetchProviderCall): Promise<JobFetchProviderOutput> {
    throw new Error(
      "Anthropic job-fetch browsing is not implemented yet. Set RESUMATCH_AI_PROVIDER=fixture or openai, " +
        "or implement this adapter before selecting RESUMATCH_AI_PROVIDER=anthropic.",
    );
  }
}
