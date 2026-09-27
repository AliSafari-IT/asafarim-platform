import type { ToolRunEnvelope, ToolRunRequest } from "./envelope";
import type { ToolRunner, ToolRunOutcome } from "./types";

/**
 * Client-side runner that talks to the server execution boundary
 * (`POST /api/tools/<slug>/run`). Safe for client components: it holds no
 * secrets and imports nothing server-only.
 *
 * One idempotency key per logical run, reused for a single retry after a
 * network failure, so a flaky connection can't make the server spend twice.
 * HTTP error responses are final and never retried here.
 */
export function createServerRunner<TResult>(
  slug: string,
  options: {
    exampleText: string;
    toInput: (text: string) => unknown;
    /** Whether this run is the catalogue example; defaults to comparing text. */
    isExample?: (text: string) => boolean;
    fetchImpl?: typeof fetch;
  },
): ToolRunner<TResult> {
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  return async (text, signal) => {
    const body: ToolRunRequest = {
      input: options.toInput(text),
      idempotencyKey: newKey(),
      mode: (options.isExample ? options.isExample(text) : text.trim() === options.exampleText.trim()) ? "example" : "live",
    };
    const send = () =>
      fetchImpl(`/api/tools/${encodeURIComponent(slug)}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });

    let response: Response;
    try {
      response = await send();
    } catch (error) {
      if (signal.aborted) throw error;
      response = await send();
    }
    let envelope: ToolRunEnvelope<TResult>;
    try {
      envelope = (await response.json()) as ToolRunEnvelope<TResult>;
    } catch {
      return { kind: "failed" };
    }
    return toOutcome(envelope);
  };
}

export function toOutcome<TResult>(envelope: ToolRunEnvelope<TResult>): ToolRunOutcome<TResult> {
  if (envelope.ok) {
    return envelope.status === "degraded"
      ? { kind: "degraded", mode: envelope.mode, result: envelope.output, missing: envelope.warnings }
      : { kind: "success", mode: envelope.mode, result: envelope.output };
  }
  const { code, message, issues, retryAfterSeconds } = envelope.error;
  switch (code) {
    case "invalid_input":
    case "input_too_large":
    case "invalid_request":
      return { kind: "invalid", issues: issues?.length ? issues : [message] };
    case "rate_limited":
    case "quota_exceeded":
      return { kind: "rate-limited", retryAfterSeconds };
    case "provider_disabled":
      return { kind: "provider-disabled", reason: "unavailable" };
    case "tool_paused":
      return { kind: "provider-disabled", reason: "paused" };
    default:
      return { kind: "failed", message };
  }
}

function newKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}
