import { proposalDraftSchema } from "../types";
import { ProviderError, type AiProvider, type ProviderCall, type ProviderOutput } from "../provider";
import { anthropicMeta, withBilledUsage } from "../cost/meta";

/**
 * Anthropic adapter (server-only). Thin wrapper over @anthropic-ai/sdk with
 * structured output. Not exercised in CI — the fixture provider is. Requires
 * ANTHROPIC_API_KEY; a no-training DPA is a contractual requirement recorded
 * in internal docs: ventures/tasks-ai/compliance/decisions.md.
 *
 * Pricing per 1M tokens is a static table here; the usage ledger is the
 * source of truth for spend and is reconciled monthly.
 */
const PRICE: Record<string, { in: number; out: number }> = {
  "claude-opus-5": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};

export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  readonly models = Object.keys(PRICE);

  async generate(call: ProviderCall): Promise<ProviderOutput> {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new ProviderError("ANTHROPIC_API_KEY is not set", false);
    }
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic();

    const requestParams = {
      model: call.model,
      max_tokens: 4096,
      system: call.prompt.system,
      messages: [{ role: "user", content: call.prompt.user }],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["summary", "operations", "openQuestions"],
            properties: {
              summary: { type: "string" },
              operations: { type: "array" },
              openQuestions: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    } as Parameters<typeof client.messages.create>[0];

    if (call.onDelta) {
      // Best-effort incremental UX (issue #236). This adapter is not
      // exercised in CI — the fixture provider is what evals/CI stream
      // against — so this path is verified by manual/live testing only.
      // Operations are still parsed from one complete JSON document once the
      // stream ends: incrementally parsing operations out of a still-partial
      // JSON array is not attempted, so "operation" deltas arrive as a burst
      // right after the last "token" delta rather than spread through it.
      let text = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let cacheRead = 0;
      let cacheWrite = 0;
      let messageId: string | undefined;
      let responseModel: string | undefined;
      try {
        const stream = await client.messages.create(
          { ...requestParams, stream: true },
          { signal: call.signal },
        );
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            text += event.delta.text;
            call.onDelta({ type: "token", text: event.delta.text });
          } else if (event.type === "message_start") {
            inputTokens = event.message.usage?.input_tokens ?? inputTokens;
            cacheRead = event.message.usage?.cache_read_input_tokens ?? 0;
            cacheWrite = event.message.usage?.cache_creation_input_tokens ?? 0;
            messageId = event.message.id;
            responseModel = event.message.model;
          } else if (event.type === "message_delta") {
            outputTokens = event.usage?.output_tokens ?? outputTokens;
          }
        }
      } catch (err) {
        throw new ProviderError(err instanceof Error ? err.message : "anthropic stream failed");
      }
      const meta = anthropicMeta({
        id: messageId,
        model: responseModel,
        usage: { input_tokens: inputTokens, output_tokens: outputTokens, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheWrite },
      });
      let draft;
      try {
        draft = proposalDraftSchema.parse(JSON.parse(text));
      } catch (err) {
        throw withBilledUsage(err, meta);
      }
      draft.operations.forEach((operation, index) => call.onDelta!({ type: "operation", operation, index }));
      const price = PRICE[call.model] ?? { in: 0, out: 0 };
      return {
        draft,
        inputTokens,
        outputTokens,
        costUsd: (inputTokens * price.in + outputTokens * price.out) / 1_000_000,
        fixture: false,
        ...meta,
      };
    }

    let res;
    try {
      res = await client.messages.create(requestParams, { signal: call.signal });
    } catch (err) {
      throw new ProviderError(err instanceof Error ? err.message : "anthropic call failed");
    }

    const text = ("content" in res ? res.content : [])
      .map((b: { type: string; text?: string }) => (b.type === "text" ? b.text ?? "" : ""))
      .join("");
    const meta = anthropicMeta("usage" in res ? (res as Parameters<typeof anthropicMeta>[0]) : null);
    let draft;
    try {
      draft = proposalDraftSchema.parse(JSON.parse(text));
    } catch (err) {
      throw withBilledUsage(err, meta);
    }

    const u = "usage" in res ? res.usage : { input_tokens: 0, output_tokens: 0 };
    const price = PRICE[call.model] ?? { in: 0, out: 0 };
    return {
      draft,
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      costUsd: ((u.input_tokens ?? 0) * price.in + (u.output_tokens ?? 0) * price.out) / 1_000_000,
      fixture: false,
      ...meta,
    };
  }
}
