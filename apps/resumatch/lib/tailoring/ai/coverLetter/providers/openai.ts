import { openAiChatMeta, withBilledUsage } from "../../../../costs/providerMeta";
import type { CoverLetterProvider, CoverLetterProviderCall, CoverLetterProviderOutput } from "../provider";
import { CoverLetterProviderError } from "../provider";
import { parseCoverLetterSuggestion } from "../schema";

/** Real OpenAI cover-letter adapter. Mirrors
 *  `../../providers/openai.ts` exactly — same plain-fetch posture, same
 *  JM-005 gate via `RESUMATCH_AI_PROVIDER`. */

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

const INPUT_USD_PER_TOKEN = 0.15 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 0.6 / 1_000_000;

interface ChatCompletionsResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class OpenAiCoverLetterProvider implements CoverLetterProvider {
  readonly name = "openai";

  async generate(call: CoverLetterProviderCall): Promise<CoverLetterProviderOutput> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new CoverLetterProviderError("OPENAI_API_KEY is not set", false);
    }

    const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: call.model,
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
      throw new CoverLetterProviderError(`OpenAI cover-letter call failed: ${response.status} ${body.slice(0, 200)}`, retryable);
    }

    const json = (await response.json()) as ChatCompletionsResponse;
    try {
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        throw new CoverLetterProviderError("OpenAI cover-letter call returned no content", true);
      }

      let data: unknown;
      try {
        data = JSON.parse(content);
      } catch {
        throw new CoverLetterProviderError("OpenAI cover-letter call returned malformed JSON", false);
      }

      const suggestion = parseCoverLetterSuggestion(data);

      const inputTokens = json.usage?.prompt_tokens ?? 0;
      const outputTokens = json.usage?.completion_tokens ?? 0;

      return {
        suggestion,
        inputTokens,
        outputTokens,
        costUsd: inputTokens * INPUT_USD_PER_TOKEN + outputTokens * OUTPUT_USD_PER_TOKEN,
        ...openAiChatMeta(json),
      };
    } catch (err) {
      throw withBilledUsage(err, openAiChatMeta(json));
    }
  }
}
