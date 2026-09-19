import type { CoverLetterProvider, CoverLetterProviderCall, CoverLetterProviderOutput } from "../provider";
import { CoverLetterProviderError } from "../provider";
import { parseCoverLetterSuggestion } from "../schema";

/** Real Anthropic cover-letter adapter. Mirrors
 *  `../../providers/anthropic.ts` exactly. */

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 2048;

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
    if (!match) throw new CoverLetterProviderError("no JSON object found in Anthropic response", false);
    return JSON.parse(match[0]);
  }
}

export class AnthropicCoverLetterProvider implements CoverLetterProvider {
  readonly name = "anthropic";

  async generate(call: CoverLetterProviderCall): Promise<CoverLetterProviderOutput> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new CoverLetterProviderError("ANTHROPIC_API_KEY is not set", false);
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
      throw new CoverLetterProviderError(
        `Anthropic cover-letter call failed: ${response.status} ${body.slice(0, 200)}`,
        retryable,
      );
    }

    const json = (await response.json()) as AnthropicMessagesResponse;
    const text = json.content?.find((block) => block.type === "text")?.text;
    if (!text) {
      throw new CoverLetterProviderError("Anthropic cover-letter call returned no text content", true);
    }

    const suggestion = parseCoverLetterSuggestion(extractJsonBlock(text));

    const inputTokens = json.usage?.input_tokens ?? 0;
    const outputTokens = json.usage?.output_tokens ?? 0;

    return {
      suggestion,
      inputTokens,
      outputTokens,
      costUsd: inputTokens * INPUT_USD_PER_TOKEN + outputTokens * OUTPUT_USD_PER_TOKEN,
    };
  }
}
