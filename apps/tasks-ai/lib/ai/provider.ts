import type { ProposalDraft, AiKind } from "./types";
import type { RenderedPrompt } from "./prompts";

export interface ProviderCall {
  kind: AiKind;
  prompt: RenderedPrompt;
  model: string;
  /**
   * True when the prompt names an existing task (see TARGET_TASK_REF): the
   * draft may parent under it and update it, and must not invent a task id.
   * The rules are in the prompt for real providers; the offline fixture
   * cannot read prose, so it reads this.
   */
  targetsExistingTask?: boolean;
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
