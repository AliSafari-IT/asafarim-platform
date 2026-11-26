import type { ProviderCallMeta } from "../../../costs/providerMeta";
import type { ResuMatchAiProvider } from "../../../env";
import { AiProviderError } from "../../../ai/providerError";
import type { FitModelOutput } from "../contract";
import type { FitInputs } from "../inputs";

/** Job fit analysis provider (#971). The reply is parsed with
 *  `parseFitModelOutput` inside the adapter; validate.ts checks it against
 *  the server's inputs afterwards. */
export interface FitProviderCall {
  inputs: FitInputs;
  system: string;
  user: string;
  promptVersion: string;
  model: string;
  signal?: AbortSignal;
}

export interface FitProviderOutput extends ProviderCallMeta {
  output: FitModelOutput;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface FitProvider {
  readonly name: ResuMatchAiProvider;
  analyze(call: FitProviderCall): Promise<FitProviderOutput>;
}

export type FitProviderErrorCode = "provider" | "timeout" | "invalid_output" | "unavailable";

export class FitProviderError extends AiProviderError {
  readonly code: FitProviderErrorCode;
  constructor(message: string, retryable = true, code: FitProviderErrorCode = "provider") {
    super(message, retryable);
    this.name = "FitProviderError";
    this.code = code;
  }
}
