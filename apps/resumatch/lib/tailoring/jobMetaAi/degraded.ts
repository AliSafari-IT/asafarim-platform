import { logError } from "../../observability/logger";
import { getEnv, type ResuMatchAiProvider, type ResuMatchRealAiProvider } from "../../env";
import { recordBilledFailure, recordUsage, QuotaExceededError } from "../ai/quota";
import { runProviderCallWithBudget } from "../../ai/runProviderCall";
import { resolveFallbackProvider } from "../../ai/fallbackProvider";
import type { CostAttribution } from "../../costs/ledger";
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

function degradeToUnknown(): JobMetaOutcome {
  return { title: null, employer: null, degraded: true };
}

export async function inferJobMetaWithFallback(
  workspaceId: string,
  jobText: string,
  opts: {
    provider?: ResuMatchAiProvider;
    /** The TargetJob this metadata is for — pre-minted by the create routes
     *  so the cost event names the job before its row exists (issue #586). */
    targetJobId?: string;
    /** Issue #511: overrides `RESUMATCH_AI_FALLBACK_PROVIDER`; null = none. */
    fallbackProvider?: ResuMatchRealAiProvider | null;
  } = {},
): Promise<JobMetaOutcome> {
  const aiProvider = opts.provider ?? getEnv().aiProvider;
  const attribution: CostAttribution = {
    subjectType: "target_job",
    subjectId: opts.targetJobId ?? workspaceId,
    targetJobId: opts.targetJobId ?? null,
  };
  if (aiProvider === "fixture" || jobText.trim().length === 0) return degradeToUnknown();

  const prompt = renderJobMetaPrompt(jobText);
  // Each attempt carries the provider serving it (issue #511).
  const route = async (name: ResuMatchAiProvider) => ({
    provider: await getJobMetaProvider(name),
    name,
    modelVersion: JOB_META_MODEL_VERSIONS[name],
  });
  const fallbackName = resolveFallbackProvider(aiProvider, opts.fallbackProvider);

  const result = await runProviderCallWithBudget({
    workspaceId,
    kind: "job_meta",
    prepare: () => route(aiProvider),
    fallback: fallbackName ? { prepare: () => route(fallbackName) } : null,
    call: async ({ provider, name, modelVersion }) => {
      const started = Date.now();
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
        provider: name,
        model: modelVersion,
        promptVersion: prompt.version,
        inputTokens: output.inputTokens,
        outputTokens: output.outputTokens,
        meta: output,
        latencyMs: Date.now() - started,
        attribution,
      });
      return { title: output.title, employer: output.employer, degraded: false };
    },
    onAttemptFailed: async (err, { name, modelVersion }, attempt) => {
      await recordBilledFailure(err, { workspaceId, kind: "job_meta", provider: name, model: modelVersion, promptVersion: prompt.version, attribution });
      logError("tailoring.job_meta.provider_call_failed", err, { workspaceId, attempt, provider: name });
    },
    isRetryable: (err) => (err instanceof JobMetaProviderError ? err.retryable : false),
  });
  if (result.ok) return result.value;

  if (result.error instanceof QuotaExceededError) {
    logError("tailoring.job_meta.degraded.budget_exhausted", result.error, { workspaceId, reason: result.error.reason });
  } else {
    logError("tailoring.job_meta.degraded.provider_call_failed", result.error, { workspaceId });
  }
  return degradeToUnknown();
}
