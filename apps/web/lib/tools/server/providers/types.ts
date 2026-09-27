import "server-only";

/**
 * Provider-neutral live completion. `execute.ts` only ever talks to this
 * interface, so a second provider (or a fallback chain) can be added later
 * without touching tool adapters.
 */
export interface LiveCompletionRequest {
  model: string;
  system: string;
  user: string;
  outputJsonSchema: Record<string, unknown>;
  maxOutputTokens: number;
  effort: "low" | "medium" | "high";
  signal: AbortSignal;
}

export interface LiveUsage {
  /** Uncached input tokens. */
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheWriteInputTokens: number;
}

export interface LiveCompletionResult {
  text: string;
  /** The model that actually answered (may differ after a server-side fallback). */
  responseModel: string;
  providerRequestId: string | null;
  usage: LiveUsage;
  /** Why generation stopped, normalized. */
  stop: "complete" | "max_tokens" | "refusal" | "other";
  fallbackUsed: boolean;
}

export type ProviderFailureKind = "timeout" | "rate_limited" | "unavailable" | "auth" | "bad_request" | "cancelled";

/**
 * A normalized provider failure. `message` is for server logs only and must
 * not contain user content; it is never sent to the browser.
 */
export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderFailureKind,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface LiveProvider {
  readonly name: string;
  complete(request: LiveCompletionRequest): Promise<LiveCompletionResult>;
}
