import { openAiChatMeta, withBilledUsage } from "../../../costs/providerMeta";
import {
  ApplicationEmailProviderError,
  type ApplicationEmailProvider,
  type ApplicationEmailProviderCall,
  type ApplicationEmailProviderOutput,
} from "../provider";
import { parseApplicationEmailSuggestion } from "../schema";

/** Real OpenAI adapter: plain fetch against Chat Completions in JSON mode,
 *  the same posture as the cover-letter adapter. Reads OPENAI_API_KEY from
 *  process.env directly. */

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const INPUT_USD_PER_TOKEN = 0.15 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 0.6 / 1_000_000;

interface ChatCompletionsResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class OpenAiApplicationEmailProvider implements ApplicationEmailProvider {
  readonly name = "openai";

  async generate(call: ApplicationEmailProviderCall): Promise<ApplicationEmailProviderOutput> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new ApplicationEmailProviderError("OPENAI_API_KEY is not set", false);

    let response: Response;
    try {
      response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
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
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      throw new ApplicationEmailProviderError(`OpenAI application email call failed: ${String(err)}`, true);
    }

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      const body = await response.text().catch(() => "");
      throw new ApplicationEmailProviderError(`OpenAI application email call failed: ${response.status} ${body.slice(0, 200)}`, retryable);
    }

    const json = (await response.json()) as ChatCompletionsResponse;
    try {
      const content = json.choices?.[0]?.message?.content;
      if (!content) throw new ApplicationEmailProviderError("OpenAI application email call returned no content", true);
      let data: unknown;
      try {
        data = JSON.parse(content);
      } catch {
        throw new ApplicationEmailProviderError("OpenAI application email call returned malformed JSON", false);
      }
      const suggestion = parseApplicationEmailSuggestion(data);
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
