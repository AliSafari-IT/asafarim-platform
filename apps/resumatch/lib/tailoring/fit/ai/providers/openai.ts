import { openAiChatMeta, withBilledUsage } from "../../../../costs/providerMeta";
import { parseFitModelOutput } from "../../contract";
import { FitProviderError, type FitProvider, type FitProviderCall, type FitProviderOutput } from "../provider";

/**
 * Real OpenAI adapter: plain `fetch()` against Chat Completions with a JSON
 * object reply, like the other adapters. The output is size-bounded
 * (`max_completion_tokens`); a reply that does not parse or does not match
 * the schema is a billed, non-retryable failure (the same input would give
 * the same shape).
 */

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
/** Same gpt-4o-mini constants and caveat as the other OpenAI adapters. */
const INPUT_USD_PER_TOKEN = 0.15 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 0.6 / 1_000_000;
export const MAX_FIT_OUTPUT_TOKENS = 6000;

interface ChatCompletionsResponse {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class OpenAiFitProvider implements FitProvider {
  readonly name = "openai";

  async analyze(call: FitProviderCall): Promise<FitProviderOutput> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new FitProviderError("OPENAI_API_KEY is not set", false, "unavailable");

    let response: Response;
    try {
      response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: call.model,
          response_format: { type: "json_object" },
          max_completion_tokens: MAX_FIT_OUTPUT_TOKENS,
          messages: [
            { role: "system", content: call.system },
            { role: "user", content: call.user },
          ],
        }),
        signal: call.signal,
      });
    } catch (err) {
      if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
        throw new FitProviderError(`OpenAI job fit call aborted: ${err.name}`, false, "timeout");
      }
      throw new FitProviderError(`OpenAI job fit call failed: ${String(err)}`, true);
    }

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      const body = await response.text().catch(() => "");
      throw new FitProviderError(`OpenAI job fit call failed: ${response.status} ${body.slice(0, 200)}`, retryable);
    }

    const json = (await response.json()) as ChatCompletionsResponse;
    try {
      const choice = json.choices?.[0];
      const content = choice?.message?.content;
      if (!content) throw new FitProviderError("OpenAI job fit call returned no content", true);
      if (choice?.finish_reason === "length") throw new FitProviderError("OpenAI job fit reply was cut at the output cap", false, "invalid_output");
      let data: unknown;
      try {
        data = JSON.parse(content);
      } catch {
        throw new FitProviderError("OpenAI job fit call returned malformed JSON", false, "invalid_output");
      }
      let output;
      try {
        output = parseFitModelOutput(data);
      } catch {
        throw new FitProviderError("OpenAI job fit call returned an unexpected shape", false, "invalid_output");
      }
      const inputTokens = json.usage?.prompt_tokens ?? 0;
      const outputTokens = json.usage?.completion_tokens ?? 0;
      return {
        output,
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
