import type { ProposalDraft, AiKind } from "./types";
import type { RenderedPrompt } from "./prompts";

export interface ProviderCall {
  kind: AiKind;
  prompt: RenderedPrompt;
  model: string;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
}

export interface ProviderOutput {
  draft: ProposalDraft;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  fixture: boolean;
}

export interface AiProvider {
  readonly name: string;
  /** Models this adapter accepts (for the registry / settings validation). */
  readonly models: readonly string[];
  generate(call: ProviderCall): Promise<ProviderOutput>;
}

export class ProviderError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.name = "ProviderError";
    this.retryable = retryable;
  }
}
