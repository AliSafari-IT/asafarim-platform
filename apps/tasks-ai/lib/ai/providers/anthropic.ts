import { proposalDraftSchema } from "../types";
import { ProviderError, type AiProvider, type ProviderCall, type ProviderOutput } from "../provider";

/**
 * Anthropic adapter (server-only). Thin wrapper over @anthropic-ai/sdk with
 * structured output. Not exercised in CI — the fixture provider is. Requires
 * ANTHROPIC_API_KEY; a no-training DPA is a contractual requirement recorded
 * in docs/compliance/decisions.md.
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

    let res;
    try {
      res = await client.messages.create(
        {
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
        } as Parameters<typeof client.messages.create>[0],
        { signal: call.signal },
      );
    } catch (err) {
      throw new ProviderError(err instanceof Error ? err.message : "anthropic call failed");
    }

    const text = ("content" in res ? res.content : [])
      .map((b: { type: string; text?: string }) => (b.type === "text" ? b.text ?? "" : ""))
      .join("");
    const draft = proposalDraftSchema.parse(JSON.parse(text));

    const u = "usage" in res ? res.usage : { input_tokens: 0, output_tokens: 0 };
    const price = PRICE[call.model] ?? { in: 0, out: 0 };
    return {
      draft,
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      costUsd: ((u.input_tokens ?? 0) * price.in + (u.output_tokens ?? 0) * price.out) / 1_000_000,
      fixture: false,
    };
  }
}
