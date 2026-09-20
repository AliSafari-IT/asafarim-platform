import { logError } from "../../observability/logger";
import { getEnv, type ResuMatchAiProvider } from "../../env";
import { assertCanRunProviderCall, recordUsage, QuotaExceededError } from "../ai/quota";
import { renderJobMetaPrompt } from "./prompts";
import { JobMetaProviderError } from "./provider";
import { JOB_META_MODEL_VERSIONS, getJobMetaProvider } from "./registry";

/**
 * Degrade wiring for the job-meta inference call. Mirrors
 * lib/tailoring/jobFetchAi/degraded.ts and every other *WithFallback
 * function in this app: budget exhaustion, retries exhausted, or a
 * malformed response all fall back to null/null (title stays unknown)
 * rather than a 500 or a fabricated guess.
 */

export interface JobMetaOutcome {
  title: string | null;
  employer: string | null;
  degraded: boolean;
}

const MAX_ATTEMPTS = 3;

function degradeToUnknown(): JobMetaOutcome {
  return { title: null, employer: null, degraded: true };
}

export async function inferJobMetaWithFallback(
  workspaceId: string,
  jobText: string,
  opts: { provider?: ResuMatchAiProvider } = {},
): Promise<JobMetaOutcome> {
  const aiProvider = opts.provider ?? getEnv().aiProvider;
  if (aiProvider === "fixture" || jobText.trim().length === 0) return degradeToUnknown();

  const prompt = renderJobMetaPrompt(jobText);

  try {
    await assertCanRunProviderCall(workspaceId, "job_meta");

    const provider = await getJobMetaProvider(aiProvider);
    const modelVersion = JOB_META_MODEL_VERSIONS[aiProvider];

    for (let attempt = 1; ; attempt++) {
      try {
        const output = await provider.infer({
          jobText: prompt.jobTextUsed,
          system: prompt.system,
          user: prompt.user,
          promptVersion: prompt.version,
          model: modelVersion,
        });
        await recordUsage({
          workspaceId,
          kind: "job_meta",
          provider: aiProvider,
          model: modelVersion,
          promptVersion: prompt.version,
          inputTokens: output.inputTokens,
          outputTokens: output.outputTokens,
          costUsd: output.costUsd,
        });
        return { title: output.title, employer: output.employer, degraded: false };
      } catch (err) {
        const retryable = err instanceof JobMetaProviderError ? err.retryable : false;
        logError("tailoring.job_meta.provider_call_failed", err, { workspaceId, attempt, provider: aiProvider });
        if (attempt >= MAX_ATTEMPTS || !retryable) throw err;
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      }
    }
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      logError("tailoring.job_meta.degraded.budget_exhausted", error, { workspaceId, reason: error.reason });
    } else {
      logError("tailoring.job_meta.degraded.provider_call_failed", error, { workspaceId });
    }
    return degradeToUnknown();
  }
}
