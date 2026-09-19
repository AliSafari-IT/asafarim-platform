import type { ResuMatchAiProvider } from "../../../env";
import type { CoverLetterSuggestion } from "./schema";

/** Mirrors `../provider.ts`'s `TailorProviderCall`/`TailorProvider` shape,
 *  applied to the cover-letter prompt instead. */
export interface CoverLetterProviderCall {
  profileText: string;
  jobText: string;
  system: string;
  user: string;
  promptVersion: string;
  model: string;
  signal?: AbortSignal;
}

export interface CoverLetterProviderOutput {
  suggestion: CoverLetterSuggestion;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  seed?: string;
}

export interface CoverLetterProvider {
  readonly name: ResuMatchAiProvider;
  generate(call: CoverLetterProviderCall): Promise<CoverLetterProviderOutput>;
}

export class CoverLetterProviderError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.name = "CoverLetterProviderError";
    this.retryable = retryable;
  }
}
