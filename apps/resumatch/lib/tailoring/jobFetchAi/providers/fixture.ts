import { fetchJobPosting } from "../../fetchJob";
import type { JobFetchProvider, JobFetchProviderCall, JobFetchProviderOutput } from "../provider";
import { JobFetchProviderError } from "../provider";

/**
 * Deterministic, offline job-fetch provider — mirrors the role of every
 * other fixture provider in this app: zero cost, no AI call, and (unlike
 * the extraction/rewrite fixtures, which are genuinely "no-op" by
 * necessity) actually does the real work here, because a plain HTTP GET is
 * a perfectly good default for the many job postings that ARE
 * server-rendered. It delegates straight to the pre-existing
 * lib/tailoring/fetchJob.ts, unchanged — `RESUMATCH_AI_PROVIDER=fixture`
 * (the default everywhere) keeps today's exact behavior, known limitations
 * (JS-rendered postings like VDAB) included.
 */
export class JobFetchFixtureProvider implements JobFetchProvider {
  readonly name = "fixture";

  async fetch(call: JobFetchProviderCall): Promise<JobFetchProviderOutput> {
    const result = await fetchJobPosting(call.url);
    if (!result.ok) {
      throw new JobFetchProviderError(`raw fetch failed: ${result.reasonCode}`, false);
    }
    return {
      title: result.title,
      employer: result.employer,
      rawText: result.rawText,
      inputTokens: 0,
      outputTokens: Math.ceil(result.rawText.length / 4),
      costUsd: 0,
    };
  }
}
