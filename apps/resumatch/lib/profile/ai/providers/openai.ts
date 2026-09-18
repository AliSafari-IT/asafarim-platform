import type { RewriteProvider, RewriteProviderCall, RewriteProviderOutput } from "../provider";
import { RewriteProviderError } from "../provider";

/**
 * Real OpenAI rewrite adapter. Plain `fetch()` against Chat Completions —
 * no `response_format` override needed, since the whole reply IS the
 * rewritten text (see prompts.ts's HARD RULES) rather than JSON to parse.
 * Mirrors lib/extraction/ai/providers/openai.ts's posture: no new SDK
 * dependency, reads OPENAI_API_KEY directly from process.env (never
 * through getEnv(), which deliberately never exposes key values),
 * reachable only behind RESUMATCH_AI_PROVIDER=openai and the JM-005 gate
 * in any deployed environment.
 */

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

/** USD per token for gpt-4o-mini, as published by OpenAI at the time this
 *  was written — see lib/extraction/ai/providers/openai.ts's identical
 *  constant/caveat. */
const INPUT_USD_PER_TOKEN = 0.15 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 0.6 / 1_000_000;

interface ChatCompletionsResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class OpenAiRewriteProvider implements RewriteProvider {
  readonly name = "openai";

  async rewrite(call: RewriteProviderCall): Promise<RewriteProviderOutput> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new RewriteProviderError("OPENAI_API_KEY is not set", false);
    }

    const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: call.model,
        temperature: 0.4,
        messages: [
          { role: "system", content: call.system },
          { role: "user", content: call.user },
        ],
      }),
      signal: call.signal,
    });

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      const body = await response.text().catch(() => "");
      throw new RewriteProviderError(`OpenAI rewrite call failed: ${response.status} ${body.slice(0, 200)}`, retryable);
    }

    const json = (await response.json()) as ChatCompletionsResponse;
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new RewriteProviderError("OpenAI rewrite call returned no content", true);
    }

    const inputTokens = json.usage?.prompt_tokens ?? 0;
    const outputTokens = json.usage?.completion_tokens ?? 0;

    return {
      text: content,
      inputTokens,
      outputTokens,
      costUsd: inputTokens * INPUT_USD_PER_TOKEN + outputTokens * OUTPUT_USD_PER_TOKEN,
    };
  }
}
