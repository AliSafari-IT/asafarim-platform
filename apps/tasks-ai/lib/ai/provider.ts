import type { ProposalDraft, AiKind } from "./types";
import type { ProviderCallMeta } from "./cost/meta";
import type { RenderedPrompt } from "./prompts";

/**
 * An incremental update during a streaming generate() call (issue #236).
 * `"token"` is raw text as it arrives — enough to show visible progress
 * during a long round trip. `"operation"` is one fully-parsed operation
 * from the eventual draft, with its index in the final `operations[]`
 * array, so a streaming UI can render proposal items as they become known
 * rather than waiting for the whole response.
 */
export type ProviderDelta =
  | { type: "token"; text: string }
  | { type: "operation"; operation: unknown; index: number };

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
  /**
   * Present only for a streaming call (issue #236). When set, a provider
   * should emit incremental deltas as they become available instead of (or
   * in addition to) only returning the final ProviderOutput. Optional: a
   * provider that ignores it still works correctly, just without the
   * incremental UX — generate() must always still resolve with the
   * complete, schema-valid draft regardless of whether deltas were sent.
   */
  onDelta?: (delta: ProviderDelta) => void;
}

/** `usage`/`responseModel`/`providerRequestId` (issue #590) feed the AI cost
 *  ledger; the adapter's own float `costUsd` is no longer the spend of record. */
export interface ProviderOutput extends ProviderCallMeta {
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
