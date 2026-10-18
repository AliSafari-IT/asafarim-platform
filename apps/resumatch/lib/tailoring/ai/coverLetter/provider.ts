import type { ProviderCallMeta } from "../../../costs/providerMeta";
import type { ResuMatchAiProvider } from "../../../env";
import type { CoverLetterSuggestion } from "./schema";
import { AiProviderError } from "../../../ai/providerError";

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

export interface CoverLetterProviderOutput extends ProviderCallMeta {
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

export class CoverLetterProviderError extends AiProviderError {
  constructor(message: string, retryable = true) {
    super(message, retryable);
    this.name = "CoverLetterProviderError";
  }
}
