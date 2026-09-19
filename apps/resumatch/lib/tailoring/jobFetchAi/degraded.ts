import { logError } from "../../observability/logger";
import { getEnv, type ResuMatchAiProvider } from "../../env";
import { assertCanRunProviderCall, recordUsage, QuotaExceededError } from "../ai/quota";
import { fetchJobPosting, isPublicHttpsUrl, type JobFetchResult } from "../fetchJob";
import { renderJobFetchPrompt } from "./prompts";
import { JobFetchProviderError } from "./provider";
import { FETCH_JOB_MODEL_VERSIONS, getJobFetchProvider } from "./registry";
import { parseJobFetchOutput } from "./schema";

/**
 * Degrade wiring for the AI job-fetch call — mirrors
 * lib/extraction/ai/degraded.ts's shape. Unlike extraction (where the
 * fixture path is what runs by default and a real provider is additive),
 * job-fetch was chosen to have AI REPLACE the raw fetch entirely once a
 * real provider is configured — see issue #443's decision record — so
 * this module's degrade path exists purely as a safety net for an actual
 * failure (network/budget/malformed response), not as the routine case.
 * `RESUMATCH_AI_PROVIDER=fixture` (the default everywhere) still gets
 * today's exact raw-fetch behavior, unchanged, with zero budget/ledger
 * interaction — same convention every other AI feature in this app
 * follows.
 */

export type JobFetchOutcome = JobFetchResult & { degraded?: boolean };

const MAX_ATTEMPTS = 3;

function degradeToRawFetch(url: string): Promise<JobFetchOutcome> {
  return fetchJobPosting(url).then((result) => ({ ...result, degraded: true }));
}

export async function fetchJobWithFallback(
  workspaceId: string,
  url: string,
  opts: { provider?: ResuMatchAiProvider } = {},
): Promise<JobFetchOutcome> {
  if (!isPublicHttpsUrl(url)) return { ok: false, reasonCode: "URL_NOT_ALLOWED" };

  const aiProvider = opts.provider ?? getEnv().aiProvider;
  if (aiProvider === "fixture") return degradeToRawFetch(url);

  try {
    await assertCanRunProviderCall(workspaceId, "fetch_job");

    const provider = await getJobFetchProvider(aiProvider);
    const modelVersion = FETCH_JOB_MODEL_VERSIONS[aiProvider];
    const prompt = renderJobFetchPrompt(url);

    for (let attempt = 1; ; attempt++) {
      try {
        const output = await provider.fetch({
          url,
          system: prompt.system,
          user: prompt.user,
          promptVersion: prompt.version,
          model: modelVersion,
        });

        // A response that doesn't match the schema is a failed call, not a
        // partial apply — thrown here so it degrades below. Never retried:
        // the same malformed shape would recur against the same input.
        const parsed = parseJobFetchOutput({
          title: output.title,
          employer: output.employer,
          rawText: output.rawText,
        });

        await recordUsage({
          workspaceId,
          kind: "fetch_job",
          provider: aiProvider,
          model: modelVersion,
          promptVersion: prompt.version,
          inputTokens: output.inputTokens,
          outputTokens: output.outputTokens,
          costUsd: output.costUsd,
        });

        return {
          ok: true,
          title: parsed.title,
          employer: parsed.employer,
          rawText: parsed.rawText,
          degraded: false,
        };
      } catch (err) {
        const retryable = err instanceof JobFetchProviderError ? err.retryable : false;
        logError("tailoring.job_fetch_ai.provider_call_failed", err, { workspaceId, attempt, provider: aiProvider });
        if (attempt >= MAX_ATTEMPTS || !retryable) throw err;
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      }
    }
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      logError("tailoring.job_fetch_ai.degraded.budget_exhausted", error, { workspaceId, reason: error.reason });
    } else {
      logError("tailoring.job_fetch_ai.degraded.provider_call_failed", error, { workspaceId });
    }
    return degradeToRawFetch(url);
  }
}
