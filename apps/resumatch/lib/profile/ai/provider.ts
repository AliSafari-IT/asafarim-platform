import type { ProviderCallMeta } from "../../costs/providerMeta";
import type { ResuMatchAiProvider } from "../../env";

export const SUMMARY_TONES = ["friendly", "official", "confident", "concise"] as const;
export type SummaryTone = (typeof SUMMARY_TONES)[number];

/**
 * Summary write/rewrite provider interface. The prompt (see prompts.ts)
 * carries the allow-listed profile text from `buildProfileText`, the
 * current summary, and the candidate's optional request; its HARD RULES
 * limit the output to facts already in the profile or summary.
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
