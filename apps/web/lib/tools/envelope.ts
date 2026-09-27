/**
 * The wire contract between the public tool UI and the server execution
 * boundary (`POST /api/tools/<slug>/run`). Types and copy only — safe to
 * import from client components. See docs/ai-tools/execution-boundary.md.
 */

export const TOOL_ENVELOPE_VERSION = 1 as const;

/** What the browser sends. `idempotencyKey` is minted once per logical run. */
export interface ToolRunRequest {
  input: unknown;
  idempotencyKey: string;
  /** `example` never spends: it always returns the tool's prepared fixture. */
  mode: "example" | "live";
}

/**
 * Stable public error codes. The UI maps these to states; nothing
 * provider-specific or internal ever crosses the wire.
 */
export const TOOL_ERROR_CODES = [
  "invalid_request",
  "invalid_input",
  "input_too_large",
  "tool_not_found",
  "provider_disabled",
  "tool_paused",
  "rate_limited",
  "quota_exceeded",
  "in_progress",
  "idempotency_conflict",
  "timeout",
  "provider_error",
  "declined",
  "invalid_output",
  "internal",
] as const;
export type ToolErrorCode = (typeof TOOL_ERROR_CODES)[number];

export interface ToolRunError {
  code: ToolErrorCode;
  /** UI-safe, actionable, never includes provider detail. */
  message: string;
  /** True when trying again later might succeed (same input). */
  retryable: boolean;
  retryAfterSeconds?: number;
  /** For `invalid_input`: field-level, UI-safe issues. */
  issues?: string[];
}

export interface ToolRunSuccess<TOutput = unknown> {
  ok: true;
  envelopeVersion: typeof TOOL_ENVELOPE_VERSION;
  status: "succeeded" | "degraded";
  tool: { slug: string; version: string; schemaVersion: string };
  /** `fixture` = deterministic, no AI call; `live` = a provider produced it. */
  mode: "fixture" | "live";
  output: TOutput;
  /** UI-safe notes, e.g. sections that were dropped in a degraded result. */
  warnings: string[];
  /** Public model alias (e.g. "claude-opus-5"); null for fixtures. */
  model: string | null;
  promptVersion: string | null;
  timing: { durationMs: number };
  /** Opaque reference to the cost event for this run; null when nothing was spent. */
  costEventRef: string | null;
}

export interface ToolRunFailure {
  ok: false;
  envelopeVersion: typeof TOOL_ENVELOPE_VERSION;
  error: ToolRunError;
}

export type ToolRunEnvelope<TOutput = unknown> = ToolRunSuccess<TOutput> | ToolRunFailure;

/** HTTP status for each error code, used by the route handler. */
export const TOOL_ERROR_STATUS: Record<ToolErrorCode, number> = {
  invalid_request: 400,
  invalid_input: 422,
  input_too_large: 413,
  tool_not_found: 404,
  provider_disabled: 503,
  tool_paused: 503,
  rate_limited: 429,
  quota_exceeded: 429,
  in_progress: 409,
  idempotency_conflict: 409,
  timeout: 504,
  provider_error: 502,
  declined: 422,
  invalid_output: 502,
  internal: 500,
};

const MESSAGES: Record<ToolErrorCode, string> = {
  invalid_request: "The request couldn't be understood. Reload the page and try again.",
  invalid_input: "Check your input and try again.",
  input_too_large: "Your text is over the limit for this tool. Shorten it and try again.",
  tool_not_found: "This tool doesn't exist.",
  provider_disabled: "Live generation isn't available right now. The example still works.",
  tool_paused: "This tool is temporarily paused. The example still works.",
  rate_limited: "You've reached the limit for now. Try again later.",
  quota_exceeded: "Live runs have reached today's limit. Try again tomorrow; the example still works.",
  in_progress: "This run is still working. Wait a moment.",
  idempotency_conflict: "This run was already used for different text. Run it again.",
  timeout: "It took too long to produce a result. Try again, or shorten your text.",
  provider_error: "The AI service had a problem. Try again in a moment.",
  declined: "The AI declined to process this text.",
  invalid_output: "The AI returned a result we couldn't use, so nothing is shown.",
  internal: "Something went wrong on our side. Nothing was saved.",
};

const RETRYABLE: ReadonlySet<ToolErrorCode> = new Set(["rate_limited", "in_progress", "timeout", "provider_error"]);

export function toolError(code: ToolErrorCode, extra: Partial<Omit<ToolRunError, "code">> = {}): ToolRunFailure {
  return {
    ok: false,
    envelopeVersion: TOOL_ENVELOPE_VERSION,
    error: { code, message: MESSAGES[code], retryable: RETRYABLE.has(code), ...extra },
  };
}
