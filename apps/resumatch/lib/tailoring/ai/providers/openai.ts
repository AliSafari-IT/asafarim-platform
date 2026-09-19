import type { TailorProvider, TailorProviderCall, TailorProviderOutput } from "../provider";
import { TailorProviderError } from "../provider";
import { parseTailorSuggestions } from "../schema";

/**
 * Real OpenAI tailoring adapter. Plain fetch() against Chat Completions
 * (json_object response format), same posture as
 * lib/extraction/ai/providers/openai.ts: no new SDK dependency, reads
 * OPENAI_API_KEY directly from process.env (never through getEnv(), which
 * deliberately never exposes key values), reachable only behind
 * RESUMATCH_AI_PROVIDER=openai and the JM-005 gate in any deployed
 * environment.
 */

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

const INPUT_USD_PER_TOKEN = 0.15 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 0.6 / 1_000_000;

interface ChatCompletionsResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class OpenAiTailorProvider implements TailorProvider {
  readonly name = "openai";

  async generate(call: TailorProviderCall): Promise<TailorProviderOutput> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new TailorProviderError("OPENAI_API_KEY is not set", false);
    }

    const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: call.model,
        // No `temperature` override: newer reasoning-style models (e.g.
        // gpt-5-mini, selectable via OPENAI_MODEL) reject any value other
        // than their default (1) with a 400 "Unsupported value" error —
        // confirmed directly against the API. Omitting it lets every model
        // use its own default rather than hard-coding a value tuned for
        // one model family.
        response_format: { type: "json_object" },
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
      throw new TailorProviderError(`OpenAI tailoring call failed: ${response.status} ${body.slice(0, 200)}`, retryable);
    }

    const json = (await response.json()) as ChatCompletionsResponse;
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new TailorProviderError("OpenAI tailoring call returned no content", true);
    }

    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch {
      throw new TailorProviderError("OpenAI tailoring call returned malformed JSON", false);
    }

    // parseTailorSuggestions is the same structural lock generate.ts's
    // mergeTailoringSuggestions relies on regardless of provider — a
    // response that doesn't match is a failed call, not a partial apply.
    const suggestions = parseTailorSuggestions(data);

    const inputTokens = json.usage?.prompt_tokens ?? 0;
    const outputTokens = json.usage?.completion_tokens ?? 0;

    return {
      suggestions,
      inputTokens,
      outputTokens,
      costUsd: inputTokens * INPUT_USD_PER_TOKEN + outputTokens * OUTPUT_USD_PER_TOKEN,
    };
  }
}
