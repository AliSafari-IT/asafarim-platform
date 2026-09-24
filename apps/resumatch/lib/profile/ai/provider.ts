import type { ProviderCallMeta } from "../../costs/providerMeta";
import type { ResuMatchAiProvider } from "../../env";

export const SUMMARY_TONES = ["friendly", "official", "confident", "concise"] as const;
export type SummaryTone = (typeof SUMMARY_TONES)[number];

/**
 * Summary-rewrite provider interface. Deliberately narrower than
 * extraction's or tailoring's: the only input is the candidate's own
 * current summary text and a tone — never the rest of the profile — so a
 * provider has no material from which to introduce a claim (an employer,
 * a skill, a metric) the candidate did not already write themselves.
 */
export interface RewriteProviderCall {
  /** The candidate's own current Summary field. Untrusted the same way any
   *  candidate-supplied text is, so it is fenced as DATA ONLY by the
   *  prompt (see prompts.ts) — the same posture extraction takes toward
   *  CV text. */
  currentSummary: string;
  tone: SummaryTone;
  system: string;
  user: string;
  promptVersion: string;
  model: string;
  signal?: AbortSignal;
}

export interface RewriteProviderOutput extends ProviderCallMeta {
  /** Plain rewritten text — not JSON. There is only one field to produce,
   *  so there is no structured-output shape to validate beyond length and
   *  non-emptiness (see schema.ts). */
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface RewriteProvider {
  readonly name: ResuMatchAiProvider;
  rewrite(call: RewriteProviderCall): Promise<RewriteProviderOutput>;
}

export class RewriteProviderError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.name = "RewriteProviderError";
    this.retryable = retryable;
  }
}
