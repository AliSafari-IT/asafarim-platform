import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ProviderError, type LiveCompletionRequest, type LiveCompletionResult, type LiveProvider } from "./types";

/**
 * Anthropic Messages adapter for the public-tools boundary.
 *
 * - SDK retries are off (`maxRetries: 0`): the boundary decides whether a
 *   retry is worth another paid attempt, and a hidden SDK retry would make
 *   one logical run spend twice.
 * - Structured output via `output_config.format` (JSON Schema); the result is
 *   still validated with Zod in `execute.ts` before anything is displayed.
 * - Server-side refusal fallbacks (`fallbacks: "default"`) so a
 *   classifier decline re-runs on Anthropic's recommended model instead of
 *   failing; `responseModel` records who actually answered.
 */
export function createAnthropicProvider(apiKey: string, options: { timeoutMs: number }): LiveProvider {
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: options.timeoutMs });

  return {
    name: "anthropic",
    async complete(request: LiveCompletionRequest): Promise<LiveCompletionResult> {
      try {
        const message = await client.beta.messages.create(
          {
            model: request.model,
            max_tokens: request.maxOutputTokens,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            system: request.system,
            messages: [{ role: "user", content: request.user }],
            output_config: {
              effort: request.effort,
              format: { type: "json_schema", schema: request.outputJsonSchema },
            },
          },
          { signal: request.signal },
        );

        const text = message.content
          .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
          .map((block) => block.text)
          .join("");
        const usage = message.usage;
        const fallbackUsed = (usage.iterations ?? []).some((entry) => entry.type === "fallback_message");

        return {
          text,
          responseModel: message.model,
          providerRequestId: (message as { _request_id?: string | null })._request_id ?? null,
          usage: {
            inputTokens: usage.input_tokens ?? 0,
            outputTokens: usage.output_tokens ?? 0,
            cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
            cacheWriteInputTokens: usage.cache_creation_input_tokens ?? 0,
          },
          stop:
            message.stop_reason === "end_turn"
              ? "complete"
              : message.stop_reason === "max_tokens"
                ? "max_tokens"
                : message.stop_reason === "refusal"
                  ? "refusal"
                  : "other",
          fallbackUsed,
        };
      } catch (error) {
        throw normalizeAnthropicError(error, request.signal);
      }
    },
  };
}

/** Maps SDK errors to provider-neutral kinds. Messages carry status codes only. */
export function normalizeAnthropicError(error: unknown, signal?: AbortSignal): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof Anthropic.APIUserAbortError || signal?.aborted) {
    return new ProviderError(signal?.reason === "timeout" ? "timeout" : "cancelled", "request aborted");
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new ProviderError("timeout", "connection timed out");
  if (error instanceof Anthropic.RateLimitError) {
    const retryAfter = Number(error.headers?.get?.("retry-after"));
    return new ProviderError("rate_limited", "anthropic 429", Number.isFinite(retryAfter) ? retryAfter : undefined);
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError("auth", `anthropic ${error.status}`);
  }
  if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.NotFoundError || error instanceof Anthropic.UnprocessableEntityError) {
    return new ProviderError("bad_request", `anthropic ${error.status}`);
  }
  if (error instanceof Anthropic.APIError) return new ProviderError("unavailable", `anthropic ${error.status ?? "error"}`);
  if (error instanceof Anthropic.APIConnectionError) return new ProviderError("unavailable", "connection failed");
  return new ProviderError("unavailable", "unexpected provider failure");
}
