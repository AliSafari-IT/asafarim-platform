import { openAiChatMeta, withBilledUsage } from "../../../../costs/providerMeta";
import {
  SkillsParagraphProviderError,
  type SkillsParagraphProvider,
  type SkillsParagraphProviderCall,
  type SkillsParagraphProviderOutput,
} from "../provider";

/**
 * Real OpenAI adapter. Plain `fetch()` against Chat Completions, like the
 * summary rewrite adapter (lib/profile/ai/providers/openai.ts): the whole
 * reply is the paragraph, so there is no JSON to parse. Reads
 * OPENAI_API_KEY from process.env directly, never through getEnv().
 */

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

/** USD per token for gpt-4o-mini — same constants and caveat as the other
 *  OpenAI adapters in this app. */
const INPUT_USD_PER_TOKEN = 0.15 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 0.6 / 1_000_000;

interface ChatCompletionsResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class OpenAiSkillsParagraphProvider implements SkillsParagraphProvider {
  readonly name = "openai";

  async write(call: SkillsParagraphProviderCall): Promise<SkillsParagraphProviderOutput> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new SkillsParagraphProviderError("OPENAI_API_KEY is not set", false);

    let response: Response;
    try {
      response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: call.model,
        // No `temperature` override, like the tailoring adapter: reasoning
        // models selectable via OPENAI_MODEL (gpt-5-mini) reject any value
        // but their default with a 400, which would never fall back.
        messages: [
          { role: "system", content: call.system },
          { role: "user", content: call.user },
        ],
      }),
      signal: call.signal,
      });
    } catch (err) {
      // A cancelled call stays cancelled; a network failure is worth a
      // retry and the fallback provider.
      if (err instanceof Error && err.name === "AbortError") throw err;
      throw new SkillsParagraphProviderError(`OpenAI skills paragraph call failed: ${String(err)}`, true);
    }

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      const body = await response.text().catch(() => "");
      throw new SkillsParagraphProviderError(
        `OpenAI skills paragraph call failed: ${response.status} ${body.slice(0, 200)}`,
        retryable,
      );
    }

    const json = (await response.json()) as ChatCompletionsResponse;
    try {
      const content = json.choices?.[0]?.message?.content;
      if (!content) throw new SkillsParagraphProviderError("OpenAI skills paragraph call returned no content", true);
      const inputTokens = json.usage?.prompt_tokens ?? 0;
      const outputTokens = json.usage?.completion_tokens ?? 0;
      return {
        text: content,
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
