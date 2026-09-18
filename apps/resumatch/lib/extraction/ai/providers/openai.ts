import type { ExtractionProvider, ExtractionProviderCall, ExtractionProviderOutput } from "../provider";
import { ExtractionProviderError } from "../provider";

/**
 * Real OpenAI extraction adapter.
 *
 * Plain `fetch()` against Chat Completions rather than the `openai` SDK
 * (already a dependency of `@asafarim/appbuilder-ai`, but not of this app)
 * — keeps the "importing this module never pulls in a provider SDK"
 * property `registry.ts` relies on, and this is one HTTP call, not enough
 * surface to justify a new dependency.
 *
 * `response_format: json_object` guarantees syntactically valid JSON, not
 * that it matches `aiExtractionSchema` — that's deliberate: the prompt
 * states the exact shape, and `schema.ts`'s `parseAiExtractionOutput` is
 * the real, structural guarantee regardless of what this adapter returns.
 * A response that doesn't match is a failed call (see
 * lib/extraction/ai/degraded.ts, #418), not a crash and not a partial
 * apply.
 *
 * Reachable only behind `RESUMATCH_AI_PROVIDER=openai`, itself gated by
 * the JM-005 sign-off flag in lib/env.ts in any deployed environment (see
 * issue #419) — this adapter being real does not, by itself, turn AI
 * extraction on anywhere but a developer's own local `.env`.
 */

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

/** USD per token for gpt-4o-mini, as published by OpenAI at the time this
 *  was written. `costUsd` is best-effort spend observability for the
 *  AiUsageLedger, not a billing-grade figure — update these constants if
 *  OpenAI's pricing changes materially. */
const INPUT_USD_PER_TOKEN = 0.15 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 0.6 / 1_000_000;

interface ChatCompletionsResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class OpenAiExtractionProvider implements ExtractionProvider {
  readonly name = "openai";

  async extract(call: ExtractionProviderCall): Promise<ExtractionProviderOutput> {
    // Read directly from process.env, never from getEnv() — lib/env.ts
    // deliberately never exposes key values, only provider name/flags.
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ExtractionProviderError("OPENAI_API_KEY is not set", false);
    }

    const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: call.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: call.system },
          { role: "user", content: call.user },
        ],
      }),
      signal: call.signal,
    });

    if (!response.ok) {
      // 429 (rate limit) and 5xx are worth a retry from the caller;
      // anything else (bad key, bad request) is not.
      const retryable = response.status === 429 || response.status >= 500;
      const body = await response.text().catch(() => "");
      throw new ExtractionProviderError(
        `OpenAI extraction call failed: ${response.status} ${body.slice(0, 200)}`,
        retryable,
      );
    }

    const json = (await response.json()) as ChatCompletionsResponse;
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new ExtractionProviderError("OpenAI extraction call returned no content", true);
    }

    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch {
      throw new ExtractionProviderError("OpenAI extraction call returned malformed JSON", false);
    }

    const inputTokens = json.usage?.prompt_tokens ?? 0;
    const outputTokens = json.usage?.completion_tokens ?? 0;

    return {
      data,
      inputTokens,
      outputTokens,
      costUsd: inputTokens * INPUT_USD_PER_TOKEN + outputTokens * OUTPUT_USD_PER_TOKEN,
    };
  }
}
