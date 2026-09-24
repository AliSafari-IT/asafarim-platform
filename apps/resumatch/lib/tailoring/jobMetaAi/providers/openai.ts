import { openAiChatMeta, withBilledUsage } from "../../../costs/providerMeta";
import { parseJobMetaOutput } from "../schema";
import { JobMetaProviderError } from "../provider";
import type { JobMetaProvider, JobMetaProviderCall, JobMetaProviderOutput } from "../provider";

/**
 * Real OpenAI job-meta adapter. Plain `fetch()` against Chat Completions
 * (json_object response format), same posture as every other OpenAI
 * adapter in this app: no new SDK dependency, reads OPENAI_API_KEY
 * directly from process.env, reachable only behind
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

export class OpenAiJobMetaProvider implements JobMetaProvider {
  readonly name = "openai";

  async infer(call: JobMetaProviderCall): Promise<JobMetaProviderOutput> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new JobMetaProviderError("OPENAI_API_KEY is not set", false);
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
      throw new JobMetaProviderError(`OpenAI job-meta call failed: ${response.status} ${body.slice(0, 200)}`, retryable);
    }

    const json = (await response.json()) as ChatCompletionsResponse;
    try {
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        throw new JobMetaProviderError("OpenAI job-meta call returned no content", true);
      }

      let data: unknown;
      try {
        data = JSON.parse(content);
      } catch {
        throw new JobMetaProviderError("OpenAI job-meta call returned malformed JSON", false);
      }

      let parsed;
      try {
        parsed = parseJobMetaOutput(data);
      } catch {
        throw new JobMetaProviderError("OpenAI job-meta call returned an unexpected shape", false);
      }

      const inputTokens = json.usage?.prompt_tokens ?? 0;
      const outputTokens = json.usage?.completion_tokens ?? 0;

      return {
        title: parsed.title,
        employer: parsed.employer,
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
