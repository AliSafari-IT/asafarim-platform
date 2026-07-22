/**
 * Stable provider-error classification, independent of any one vendor's
 * exception shape. Every adapter (OpenAI, fake/fixture, any future
 * provider) must map its own errors onto this closed set — callers
 * (the generation pipeline, job state machine) branch on `code`, never on
 * a vendor-specific error class or message string.
 */
export const PROVIDER_ERROR_CODES = [
  /** Missing/invalid API key, model not permitted for this account, etc. */
  "authentication_error",
  /** Provider rate limit hit — retryable after backoff. */
  "rate_limit",
  /** Request exceeded the configured timeout. */
  "timeout",
  /** Network failure, 5xx, provider outage — retryable. */
  "unavailable",
  /** Response didn't match the requested structured schema. */
  "malformed_response",
  /** Caller-side misconfiguration (bad model name, invalid request shape). */
  "invalid_request",
  /** Request was aborted via the provided AbortSignal. */
  "cancelled",
  /** Anything that doesn't fit the above — never silently swallowed. */
  "unknown",
] as const;

export type ProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[number];

/** Error codes safe to retry with backoff, as opposed to failing the job outright. */
export const RETRYABLE_PROVIDER_ERROR_CODES: ReadonlySet<ProviderErrorCode> = new Set([
  "rate_limit",
  "timeout",
  "unavailable",
]);

export function isRetryableProviderError(code: ProviderErrorCode): boolean {
  return RETRYABLE_PROVIDER_ERROR_CODES.has(code);
}

export interface ProviderErrorOptions {
  code: ProviderErrorCode;
  message: string;
  /** Internal diagnostic detail for operators — never shown to end users, never logged with secrets. */
  cause?: unknown;
  retryAfterMs?: number;
}

/**
 * The only error type provider adapters may throw. `cause` is intentionally
 * typed `unknown` and never serialized automatically — callers that log
 * this must go through the redaction layer (see redact.ts) rather than
 * dumping `cause` directly, since a raw SDK error can carry request/response
 * bodies that include API keys or full prompts.
 */
export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly cause?: unknown;
  readonly retryAfterMs?: number;

  constructor(options: ProviderErrorOptions) {
    super(options.message);
    this.name = "ProviderError";
    this.code = options.code;
    this.cause = options.cause;
    this.retryAfterMs = options.retryAfterMs;
  }

  get retryable(): boolean {
    return isRetryableProviderError(this.code);
  }
}

/** Safe, user-facing message per error code — never includes `cause` or provider internals. */
export function safeProviderErrorMessage(code: ProviderErrorCode): string {
  switch (code) {
    case "authentication_error":
      return "The AI provider is not configured correctly. An operator has been notified.";
    case "rate_limit":
      return "The AI provider is temporarily rate-limited. Retrying automatically.";
    case "timeout":
      return "The AI provider took too long to respond. Retrying automatically.";
    case "unavailable":
      return "The AI provider is temporarily unavailable. Retrying automatically.";
    case "malformed_response":
      return "The AI provider returned an unexpected response. Retrying automatically.";
    case "invalid_request":
      return "This request could not be processed. An operator has been notified.";
    case "cancelled":
      return "Generation was cancelled.";
    case "unknown":
    default:
      return "Something went wrong while generating your application. An operator has been notified.";
  }
}
