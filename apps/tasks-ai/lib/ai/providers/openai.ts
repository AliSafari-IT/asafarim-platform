import { proposalDraftSchema } from "../types";
import { ProviderError, type AiProvider, type ProviderCall, type ProviderOutput } from "../provider";

/**
 * OpenAI adapter (server-only). Thin wrapper over the `openai` SDK with JSON
 * response format. Not exercised in CI. Requires OPENAI_API_KEY and a
 * no-training agreement (docs/compliance/decisions.md).
 */
const PRICE: Record<string, { in: number; out: number }> = {
  "gpt-4.1": { in: 2, out: 8 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "o4-mini": { in: 1.1, out: 4.4 },
};

export class OpenAiProvider implements AiProvider {
  readonly name = "openai";
  readonly models = Object.keys(PRICE);

  async generate(call: ProviderCall): Promise<ProviderOutput> {
    if (!process.env.OPENAI_API_KEY) {
      throw new ProviderError("OPENAI_API_KEY is not set", false);
    }
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI();

    let res;
    try {
      res = await client.chat.completions.create(
        {
          model: call.model,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: call.prompt.system },
            { role: "user", content: call.prompt.user },
          ],
        },
        { signal: call.signal },
      );
    } catch (err) {
      throw new ProviderError(err instanceof Error ? err.message : "openai call failed");
    }

    const text = res.choices[0]?.message?.content ?? "{}";
    const draft = proposalDraftSchema.parse(JSON.parse(text));
    const u = res.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
    const price = PRICE[call.model] ?? { in: 0, out: 0 };
    return {
      draft,
      inputTokens: u.prompt_tokens ?? 0,
      outputTokens: u.completion_tokens ?? 0,
      costUsd: ((u.prompt_tokens ?? 0) * price.in + (u.completion_tokens ?? 0) * price.out) / 1_000_000,
      fixture: false,
    };
  }
}
