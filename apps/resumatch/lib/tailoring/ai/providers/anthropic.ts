import type { TailorProvider, TailorProviderCall, TailorProviderOutput } from "../provider";
import { TailorProviderError } from "../provider";
import { parseTailorSuggestions } from "../schema";

/**
 * Real Anthropic tailoring adapter. Plain fetch() against the Messages API
 * — no SDK dependency, same posture as every other real provider adapter
 * in this app. Reads ANTHROPIC_API_KEY directly from process.env (never
 * through getEnv()), reachable only behind RESUMATCH_AI_PROVIDER=anthropic
 * and the JM-005 gate in any deployed environment.
 *
 * Anthropic's Messages API has no strict JSON response-format option the
 * way OpenAI's Chat Completions does — the prompt's own "reply with ONLY
 * one JSON object" instruction is the only thing asking for it, so the
 * response is parsed defensively (recovering the first {...} block) rather
 * than assuming `response.content[0].text` is bare JSON.
 */

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 2048;

/** USD per token — Claude Opus pricing as published by Anthropic at the
 *  time this was written. Best-effort spend observability, not a
 *  billing-grade figure; update if Anthropic's pricing changes, or if
 *  ANTHROPIC_MODEL is pointed at a cheaper/pricier model than the default
 *  these constants were set for. */
const INPUT_USD_PER_TOKEN = 15 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 75 / 1_000_000;

interface AnthropicMessagesResponse {
  content?: { type?: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

function extractJsonBlock(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new TailorProviderError("no JSON object found in Anthropic response", false);
    return JSON.parse(match[0]);
  }
}

export class AnthropicTailorProvider implements TailorProvider {
  readonly name = "anthropic";

  async generate(call: TailorProviderCall): Promise<TailorProviderOutput> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new TailorProviderError("ANTHROPIC_API_KEY is not set", false);
    }

    const maxTokens = Number(process.env.ANTHROPIC_MAX_TOKENS) || DEFAULT_MAX_TOKENS;

    const response = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify({
        model: call.model,
        max_tokens: maxTokens,
        temperature: 0.3,
        system: call.system,
        messages: [{ role: "user", content: call.user }],
      }),
      signal: call.signal,
    });

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      const body = await response.text().catch(() => "");
      throw new TailorProviderError(
        `Anthropic tailoring call failed: ${response.status} ${body.slice(0, 200)}`,
        retryable,
      );
    }

    const json = (await response.json()) as AnthropicMessagesResponse;
    const text = json.content?.find((block) => block.type === "text")?.text;
    if (!text) {
      throw new TailorProviderError("Anthropic tailoring call returned no text content", true);
    }

    const suggestions = parseTailorSuggestions(extractJsonBlock(text));

    const inputTokens = json.usage?.input_tokens ?? 0;
    const outputTokens = json.usage?.output_tokens ?? 0;

    return {
      suggestions,
      inputTokens,
      outputTokens,
      costUsd: inputTokens * INPUT_USD_PER_TOKEN + outputTokens * OUTPUT_USD_PER_TOKEN,
    };
  }
}
