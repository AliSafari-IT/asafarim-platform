import type { ProviderCallMeta } from "../../costs/providerMeta";
import type { ResuMatchAiProvider } from "../../env";

/**
 * Job-fetch provider interface. Unlike the extraction/tailoring/rewrite
 * providers, the "input" here is a URL, not text this app already holds —
 * the provider does its own page reading (a raw HTTP GET for the fixture
 * provider, a real browsing tool call for a real provider). See
 * lib/tailoring/jobFetchAi/providers/{fixture,openai}.ts.
 */
export interface JobFetchProviderCall {
  url: string;
  system: string;
  user: string;
  promptVersion: string;
  model: string;
  signal?: AbortSignal;
}

export interface JobFetchProviderOutput extends ProviderCallMeta {
  title: string | null;
  employer: string | null;
  /** Readable job-description text, ready for the same downstream path
   *  (buildProfileText/renderTailorPrompt) that raw-fetched text already
   *  goes through — for the fixture provider this is the existing regex
   *  extraction; for a real provider it is text the model itself read off
   *  the page while browsing it. */
  rawText: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface JobFetchProvider {
  readonly name: ResuMatchAiProvider;
  fetch(call: JobFetchProviderCall): Promise<JobFetchProviderOutput>;
}

export class JobFetchProviderError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.name = "JobFetchProviderError";
    this.retryable = retryable;
  }
}
