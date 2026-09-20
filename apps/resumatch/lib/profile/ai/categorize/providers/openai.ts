import { parseCategorizeOutput } from "../schema";
import { CategorizeSkillsProviderError } from "../provider";
import type {
  CategorizeSkillsProvider,
  CategorizeSkillsProviderCall,
  CategorizeSkillsProviderOutput,
} from "../provider";

/**
 * Real OpenAI categorize adapter. Plain `fetch()` against Chat Completions
 * (json_object response format), same posture as
 * lib/tailoring/ai/providers/openai.ts and lib/profile/ai/providers/openai.ts:
 * no new SDK dependency, reads OPENAI_API_KEY directly from process.env
 * (never through getEnv(), which deliberately never exposes key values),
 * reachable only behind RESUMATCH_AI_PROVIDER=openai and the JM-005 gate
 * in any deployed environment.
 */

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

const INPUT_USD_PER_TOKEN = 0.15 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 0.6 / 1_000_000;

interface ChatCompletionsResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class OpenAiCategorizeSkillsProvider implements CategorizeSkillsProvider {
  readonly name = "openai";

  async categorize(call: CategorizeSkillsProviderCall): Promise<CategorizeSkillsProviderOutput> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new CategorizeSkillsProviderError("OPENAI_API_KEY is not set", false);
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
      throw new CategorizeSkillsProviderError(
        `OpenAI categorize call failed: ${response.status} ${body.slice(0, 200)}`,
        retryable,
      );
    }

    const json = (await response.json()) as ChatCompletionsResponse;
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new CategorizeSkillsProviderError("OpenAI categorize call returned no content", true);
    }

    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch {
      throw new CategorizeSkillsProviderError("OpenAI categorize call returned malformed JSON", false);
    }

    // parseCategorizeOutput is only the shape check — schema.ts's
    // mergeSuggestedCategories (called by the API route, not here) is the
    // actual no-fabrication lock, the same two-step structure tailoring
    // and rewrite already use.
    let suggestions;
    try {
      suggestions = parseCategorizeOutput(data);
    } catch {
      throw new CategorizeSkillsProviderError("OpenAI categorize call returned an unexpected shape", false);
    }

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
