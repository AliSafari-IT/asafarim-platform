import { log, logError } from "../../observability/logger";
import { getEnv, type ResuMatchAiProvider, type ResuMatchRealAiProvider } from "../../env";
import { recordBilledFailure, settleProviderCall, QuotaExceededError } from "../ai/quota";
import { runProviderCallWithBudget } from "../../ai/runProviderCall";
import { resolveFallbackProvider } from "../../ai/fallbackProvider";
import type { CostAttribution } from "../../costs/ledger";
import { assessFetchQuality } from "../fetchQuality";
import { fetchJobPosting, isPublicHttpsUrl, type JobFetchRefusal, type JobFetchResult, type PageEvidence } from "../fetchJob";
import { renderJobPosting } from "../render/renderJob";
import { groundJobFetchOutput, type JobFetchGrounding } from "./grounding";
import { renderJobFetchPrompt } from "./prompts";
import { JobFetchProviderError } from "./provider";
import { FETCH_JOB_MODEL_VERSIONS, getJobFetchProvider } from "./registry";
import { parseJobFetchOutput } from "./schema";
import { getDedupedResult, storeDedupedResult, type DedupKeyParts } from "../../shared/aiDedupCache";

/**
 * Tiered job fetch (issue #517). Every request tries the cheap,
 * deterministic `fetchJobPosting` GET first; the AI-browsing provider is
 * only a second tier, used when that GET could not read the page:
 *
 * - deterministic `ok: true` → returned as is: no quota check, no provider
 *   call, no ledger row (most career pages are server-rendered);
 * - deterministic failure for a page reason (see `shouldEscalate`) and a
 *   real provider configured with escalation on → the AI-browsing call,
 *   with the existing dedup cache, quota, retry and degrade handling;
 * - the AI tier fails or is over budget → the deterministic result is
 *   returned, marked `degraded` (the same answer a fixture deployment gets).
 *
 * This replaces issue #443's "AI replaces the raw fetch entirely" choice,
 * which paid for an AI call on every fetch even when the GET would have
 * worked. `RESUMATCH_AI_PROVIDER=fixture` (the default everywhere) keeps
 * the exact raw-fetch behavior with zero budget/ledger interaction, and
 * `RESUMATCH_JOB_FETCH_AI_ESCALATION=off` keeps a real-provider deployment
 * deterministic-only for cost control.
 *
 * Issue #518 adds a render tier inside tier 1: when the plain GET got the
 * page but no readable text (`NO_READABLE_TEXT`, the JavaScript-shell
 * case) and `RESUMATCH_JOB_FETCH_RENDER=on`, headless Chromium renders the
 * page before anything is sent to a paid model. It costs no money, only
 * server time, so it goes first; it runs for no other refusal (a bot wall
 * or an HTTP error is not something a browser should be used to get past).
 * With the flag off (the default) nothing here changes.
 *
 * Issue #521 grounds the AI tier: what the plain GET saw of the page is
 * passed to the model and checked against its answer afterwards (see
 * grounding.ts for the lenient-flag decision).
 */

export type JobFetchOutcome = (Extract<JobFetchResult, { ok: true }> | { ok: false; reasonCode: JobFetchRefusal }) & {
  degraded?: boolean;
  /** Set on an AI-tier result only (#521). */
  grounding?: JobFetchGrounding;
};

/** Evidence is internal (prompt and grounding input), never returned. */
function withoutEvidence(result: JobFetchResult): JobFetchOutcome {
  if (result.ok) return result;
  return { ok: false, reasonCode: result.reasonCode };
}

/**
 * Tier 1: the plain GET, then (when enabled) the render tier for a page
 * that came back as a JavaScript shell. Returns the GET's own refusal when
 * the render does not help, with the richer evidence of the two.
 */
export async function deterministicFetch(url: string, render: boolean = getEnv().jobFetchRender): Promise<JobFetchResult> {
  const plain = await fetchJobPosting(url);
  if (plain.ok || plain.reasonCode !== "NO_READABLE_TEXT" || !render) return plain;
  const rendered = await renderJobPosting(url);
  if (rendered.ok) return rendered;
  return { ...plain, evidence: rendered.evidence ?? plain.evidence };
}

function degradeToRawFetch(url: string, render?: boolean): Promise<JobFetchOutcome> {
  return deterministicFetch(url, render).then((result) => ({ ...withoutEvidence(result), degraded: true }));
}

/**
 * Whether a deterministic refusal may go to the AI tier. Every refusal is
 * about the page (unreadable text, a bot wall, an HTTP or network error, a
 * redirect our SSRF rule won't follow, an oversized body), which a browsing
 * model fetching from its own infrastructure may still read — except
 * `URL_NOT_ALLOWED`: a URL we refuse to fetch is never handed to a model
 * to fetch instead.
 */
export function shouldEscalate(reasonCode: JobFetchRefusal): boolean {
  return reasonCode !== "URL_NOT_ALLOWED";
}

export async function fetchJobWithFallback(
  workspaceId: string,
  url: string,
  opts: {
    provider?: ResuMatchAiProvider;
    /** Existing (refresh) or pre-minted (first fetch) TargetJob id (issue #586). */
    targetJobId?: string;
    /** Overrides `RESUMATCH_JOB_FETCH_AI_ESCALATION` (tests). */
    escalate?: boolean;
    /** Issue #511: overrides `RESUMATCH_AI_FALLBACK_PROVIDER`; null = none. */
    fallbackProvider?: ResuMatchRealAiProvider | null;
    /** Overrides `RESUMATCH_JOB_FETCH_RENDER` (tests). */
    render?: boolean;
  } = {},
): Promise<JobFetchOutcome> {
  const attribution: CostAttribution = {
    subjectType: "target_job",
    subjectId: opts.targetJobId ?? workspaceId,
    targetJobId: opts.targetJobId ?? null,
  };
  if (!isPublicHttpsUrl(url)) return { ok: false, reasonCode: "URL_NOT_ALLOWED" };

  const aiProvider = opts.provider ?? getEnv().aiProvider;
  if (aiProvider === "fixture") return degradeToRawFetch(url, opts.render);

  // Tier 1: the deterministic GET (and the render tier), at zero AI cost.
  const deterministic = await deterministicFetch(url, opts.render);
  if (deterministic.ok) return { ...deterministic, degraded: false };

  const escalate = opts.escalate ?? getEnv().jobFetchAiEscalation;
  if (!escalate || !shouldEscalate(deterministic.reasonCode)) {
    return { ...withoutEvidence(deterministic), degraded: true };
  }
  // Tier 2 failed below → hand back the tier-1 answer without fetching again.
  const degradeToDeterministic = (): JobFetchOutcome => ({ ...withoutEvidence(deterministic), degraded: true });
  const evidence: PageEvidence | null = deterministic.evidence ?? null;

  const modelVersion = FETCH_JOB_MODEL_VERSIONS[aiProvider];
  const prompt = renderJobFetchPrompt(url, evidence);
  // Issue #513: the same URL fetched again within a few minutes (a retry
  // after a transient error) reuses the last successful result: no quota
  // check, no provider call, no second ledger row.
  const dedupKey: DedupKeyParts = {
    workspaceId,
    kind: "fetch_job",
    provider: aiProvider,
    model: modelVersion,
    promptCacheKey: prompt.cacheKey,
  };
  const cached = getDedupedResult<JobFetchOutcome>(dedupKey);
  if (cached) return cached;

  // Each attempt carries the provider serving it, so a fallback-served call
  // (issue #511) is ledgered under the fallback provider.
  const route = async (name: ResuMatchAiProvider) => ({
    provider: await getJobFetchProvider(name),
    name,
    modelVersion: FETCH_JOB_MODEL_VERSIONS[name],
  });
  const fallbackName = resolveFallbackProvider(aiProvider, opts.fallbackProvider);

  const result = await runProviderCallWithBudget({
    workspaceId,
    kind: "fetch_job",
    prepare: () => route(aiProvider),
    fallback: fallbackName ? { prepare: () => route(fallbackName) } : null,
    call: async ({ provider, name, modelVersion }) => {
      const started = Date.now();
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
      const parsed = await settleProviderCall(
        {
          workspaceId,
          kind: "fetch_job",
          provider: name,
          model: modelVersion,
          promptVersion: prompt.version,
          inputTokens: output.inputTokens,
          outputTokens: output.outputTokens,
          meta: output,
          latencyMs: Date.now() - started,
          attribution,
        },
        () => parseJobFetchOutput({ title: output.title, employer: output.employer, rawText: output.rawText }),
      );

      // The same heuristics as tier 1 (#520): a model reading a cookie
      // wall can hand back boilerplate too. Plus #521: a title or employer
      // the fetched page does not contain is flagged, not rejected.
      const quality = assessFetchQuality(parsed);
      const grounding = groundJobFetchOutput(parsed, evidence);
      if (grounding.status === "mismatch") {
        quality.reasons.push("NOT_ON_FETCHED_PAGE");
        quality.looksIncomplete = true;
        log.info("tailoring.job_fetch_ai.grounding_mismatch", { workspaceId, fields: grounding.mismatched });
      }
      const outcome: JobFetchOutcome = {
        ok: true,
        title: parsed.title,
        employer: parsed.employer,
        rawText: parsed.rawText,
        quality,
        degraded: false,
        grounding,
      };
      // Stored under the primary's key, the one the next lookup uses.
      storeDedupedResult(dedupKey, outcome);
      return outcome;
    },
    onAttemptFailed: async (err, { name, modelVersion }, attempt) => {
      await recordBilledFailure(err, { workspaceId, kind: "fetch_job", provider: name, model: modelVersion, promptVersion: prompt.version, attribution });
      logError("tailoring.job_fetch_ai.provider_call_failed", err, { workspaceId, attempt, provider: name });
    },
    isRetryable: (err) => (err instanceof JobFetchProviderError ? err.retryable : false),
  });
  if (result.ok) return result.value;

  if (result.error instanceof QuotaExceededError) {
    logError("tailoring.job_fetch_ai.degraded.budget_exhausted", result.error, { workspaceId, reason: result.error.reason });
  } else {
    logError("tailoring.job_fetch_ai.degraded.provider_call_failed", result.error, { workspaceId });
  }
  return degradeToDeterministic();
}
