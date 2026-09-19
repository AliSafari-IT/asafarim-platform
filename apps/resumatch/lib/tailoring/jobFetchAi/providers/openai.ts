import type { JobFetchProvider, JobFetchProviderCall, JobFetchProviderOutput } from "../provider";
import { JobFetchProviderError } from "../provider";

/**
 * Real OpenAI job-fetch adapter — uses the Responses API's hosted
 * web-search/browsing tool (`/v1/responses`, NOT the `/v1/chat/completions`
 * endpoint the extraction/tailoring/rewrite adapters use), so the model
 * reads the page itself instead of this app fetching raw HTML and parsing
 * it with regex. This is what actually gets past JS-rendered job boards
 * like VDAB (see issue #443) — a plain HTTP GET never sees their content at
 * all, because it does not exist until client-side JavaScript runs.
 *
 * The exact tool name/shape below is implemented from established
 * knowledge of the Responses API without live documentation access at the
 * time of writing — verify against OpenAI's current docs before enabling
 * in any deployed environment. Designed to fail closed: any unexpected
 * response shape throws JobFetchProviderError, which degrades to the
 * fixture (raw-fetch) path rather than crashing (see
 * lib/tailoring/jobFetchAi/degraded.ts).
 *
 * Reachable only behind RESUMATCH_AI_PROVIDER=openai and the JM-005 gate
 * in any deployed environment, same as every other real provider adapter
 * in this app.
 */

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

/** USD per token for gpt-4o-mini — see the identical constant/caveat in
 *  lib/extraction/ai/providers/openai.ts. Web-search tool calls may carry
 *  their own per-call fee on top of token cost; not reflected here since
 *  the Responses API's usage payload does not (at the time of writing)
 *  break that out separately. costUsd is best-effort spend observability,
 *  not a billing-grade figure. */
const INPUT_USD_PER_TOKEN = 0.15 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 0.6 / 1_000_000;

interface ResponsesApiOutputContent {
  type?: string;
  text?: string;
}

interface ResponsesApiOutputItem {
  type?: string;
  content?: ResponsesApiOutputContent[];
}

interface ResponsesApiResponse {
  output?: ResponsesApiOutputItem[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

function extractJsonBlock(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // The prompt asks for JSON only, but a browsing-capable model is more
    // prone to wrapping its answer in a sentence or a fence than a plain
    // completion is — recover the first {...} block rather than treating
    // stray prose as an outright failure.
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new JobFetchProviderError("no JSON object found in response", false);
    return JSON.parse(match[0]);
  }
}

export class OpenAiJobFetchProvider implements JobFetchProvider {
  readonly name = "openai";

  async fetch(call: JobFetchProviderCall): Promise<JobFetchProviderOutput> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new JobFetchProviderError("OPENAI_API_KEY is not set", false);
    }

    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: call.model,
        temperature: 0,
        tools: [{ type: "web_search_preview" }],
        input: [
          { role: "system", content: call.system },
          { role: "user", content: call.user },
        ],
      }),
      signal: call.signal,
    });

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      const body = await response.text().catch(() => "");
      throw new JobFetchProviderError(
        `OpenAI job-fetch call failed: ${response.status} ${body.slice(0, 200)}`,
        retryable,
      );
    }

    const json = (await response.json()) as ResponsesApiResponse;
    const message = (json.output ?? []).find((item) => item.type === "message");
    const text = message?.content?.find((c) => c.type === "output_text")?.text;
    if (!text) {
      throw new JobFetchProviderError("OpenAI job-fetch call returned no text output", true);
    }

    const data = extractJsonBlock(text) as { title?: unknown; employer?: unknown; rawText?: unknown };
    const inputTokens = json.usage?.input_tokens ?? 0;
    const outputTokens = json.usage?.output_tokens ?? 0;

    return {
      title: typeof data.title === "string" ? data.title : null,
      employer: typeof data.employer === "string" ? data.employer : null,
      rawText: typeof data.rawText === "string" ? data.rawText : "",
      inputTokens,
      outputTokens,
      costUsd: inputTokens * INPUT_USD_PER_TOKEN + outputTokens * OUTPUT_USD_PER_TOKEN,
    };
  }
}
