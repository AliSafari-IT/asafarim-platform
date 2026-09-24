import type { ProviderCallMeta } from "../../costs/providerMeta";
import type { ResuMatchAiProvider } from "../../env";

/**
 * Job-title/employer inference from already-extracted job text — the
 * missing counterpart to lib/tailoring/jobFetchAi (which browses a URL
 * itself) for the three intake paths that never had a URL to browse:
 * paste-job, paste-email (as a fallback when its own header-guess finds
 * nothing), and upload-job. Those routes used to hard-code title/employer
 * to null, reasoning (correctly, at the time) that there was no reliable
 * heuristic for pulling a title out of arbitrary prose the way
 * `<title>`/`og:title` works for a fetched page. That reasoning predates
 * RESUMATCH_AI_PROVIDER ever being set to a real provider — inferring a
 * short title/employer from the opening of a job posting is a well-scoped,
 * low-risk extraction task, the same category jobFetchAi already handles
 * safely for the URL case.
 */
export interface JobMetaProviderCall {
  /** Already-extracted, already-redacted job text — the same text that
   *  becomes `TargetJob.rawText`. Untrusted the same way any candidate- or
   *  third-party-supplied text is (see prompts.ts's HARD RULES). */
  jobText: string;
  system: string;
  user: string;
  promptVersion: string;
  model: string;
  signal?: AbortSignal;
}

export interface JobMetaProviderOutput extends ProviderCallMeta {
  title: string | null;
  employer: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface JobMetaProvider {
  readonly name: ResuMatchAiProvider;
  infer(call: JobMetaProviderCall): Promise<JobMetaProviderOutput>;
}

export class JobMetaProviderError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.name = "JobMetaProviderError";
    this.retryable = retryable;
  }
}
