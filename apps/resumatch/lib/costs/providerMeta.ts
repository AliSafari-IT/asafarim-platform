import { normalizeAnthropicUsage, normalizeOpenAiUsage, type UsageLine } from "@asafarim/ai-cost-ledger";

/**
 * What a real provider adapter reports about a call, besides its payload.
 * Optional on every adapter output so fixture adapters (which have no
 * provider response) and older test doubles keep compiling; the ledger
 * falls back to the adapter's plain input/output token counts.
 */
export interface ProviderCallMeta {
  /** Exclusive usage buckets, already normalized from the raw provider counts. */
  usage?: UsageLine[];
  /** The model the provider says answered (may be a dated snapshot of the requested alias). */
  responseModel?: string | null;
  providerRequestId?: string | null;
}

type OpenAiUsage = Parameters<typeof normalizeOpenAiUsage>[0];

function safeNormalize(fn: () => UsageLine[]): UsageLine[] | undefined {
  try {
    return fn();
  } catch {
    // A provider payload whose sub-counts exceed their totals is malformed;
    // fall back to the adapter's plain token counts rather than failing a
    // call the user already paid for.
    return undefined;
  }
}

/** OpenAI Chat Completions (`/v1/chat/completions`). */
export function openAiChatMeta(json: { id?: string; model?: string; usage?: OpenAiUsage | null }): ProviderCallMeta {
  return {
    usage: json.usage ? safeNormalize(() => normalizeOpenAiUsage(json.usage!)) : undefined,
    responseModel: json.model ?? null,
    providerRequestId: json.id ?? null,
  };
}

/** OpenAI Responses API (`/v1/responses`) — adds hosted tool calls (web search) as their own bucket. */
export function openAiResponsesMeta(json: {
  id?: string;
  model?: string;
  usage?: OpenAiUsage | null;
  output?: { type?: string }[];
}): ProviderCallMeta {
  const toolCalls = (json.output ?? []).filter((item) => item.type === "web_search_call").length;
  const tokens = json.usage ? safeNormalize(() => normalizeOpenAiUsage(json.usage!)) : undefined;
  const usage = tokens && toolCalls > 0 ? [...tokens, { bucket: "tool_call" as const, unit: "calls" as const, quantity: toolCalls }] : tokens;
  return { usage, responseModel: json.model ?? null, providerRequestId: json.id ?? null };
}

/** Anthropic Messages API. */
export function anthropicMeta(json: {
  id?: string;
  model?: string;
  usage?: Parameters<typeof normalizeAnthropicUsage>[0] | null;
}): ProviderCallMeta {
  return {
    usage: json.usage ? safeNormalize(() => normalizeAnthropicUsage(json.usage!)) : undefined,
    responseModel: json.model ?? null,
    providerRequestId: json.id ?? null,
  };
}

const BILLED = Symbol.for("resumatch.aiCost.billedUsage");

/**
 * Mark an error thrown *after* the provider answered (malformed JSON, a
 * shape that fails validation, an empty message) with the usage that
 * response still billed. The call site's retry/degrade catch reads it back
 * with `billedUsageOf` and records a `failed` cost event, so a response
 * the provider charged for is never dropped from the ledger just because
 * we could not use it.
 */
export function withBilledUsage(err: unknown, meta: ProviderCallMeta): unknown {
  if (err && typeof err === "object" && meta.usage && meta.usage.length > 0) {
    (err as Record<symbol, unknown>)[BILLED] = meta;
  }
  return err;
}

export function billedUsageOf(err: unknown): ProviderCallMeta | null {
  if (err && typeof err === "object" && BILLED in err) {
    return (err as Record<symbol, ProviderCallMeta>)[BILLED] ?? null;
  }
  return null;
}
