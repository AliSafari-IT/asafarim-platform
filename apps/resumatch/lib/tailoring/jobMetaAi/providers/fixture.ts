import type { JobMetaProvider, JobMetaProviderCall, JobMetaProviderOutput } from "../provider";

/**
 * Deterministic, offline job-meta provider — mirrors every other fixture
 * in this app: zero cost, no network. Unlike lib/profile/ai/categorize's
 * fixture (which has a genuinely useful deterministic fallback to run),
 * there is no honest deterministic way to pull a title out of arbitrary
 * prose — that is exactly the gap this feature exists to close — so this
 * always returns null/null, the same "cannot honestly invent structure"
 * posture lib/profile/ai/providers/fixture.ts's rewrite fixture takes.
 */
export class JobMetaFixtureProvider implements JobMetaProvider {
  readonly name = "fixture";

  async infer(call: JobMetaProviderCall): Promise<JobMetaProviderOutput> {
    const tokens = Math.ceil(call.jobText.length / 4);
    return { title: null, employer: null, inputTokens: tokens, outputTokens: 0, costUsd: 0 };
  }
}
