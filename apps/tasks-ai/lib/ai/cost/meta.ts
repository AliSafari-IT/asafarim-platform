import {
  normalizeAnthropicUsage,
  normalizeOpenAiUsage,
  simpleTokenUsage,
  type UsageLine,
} from "@asafarim/ai-cost-ledger";

/**
 * What a provider adapter reports about the call itself (issue #590):
 * exclusive usage buckets, the model that actually answered and the
 * provider's request id. Optional on ProviderOutput so the fixture
 * provider and test doubles keep compiling.
 */
export interface ProviderCallMeta {
  usage?: UsageLine[];
  responseModel?: string | null;
  providerRequestId?: string | null;
}

function safe(fn: () => UsageLine[], input: number, output: number): UsageLine[] {
  try {
    return fn();
  } catch {
    return simpleTokenUsage(input, output);
  }
}

type OpenAiUsage = Parameters<typeof normalizeOpenAiUsage>[0];
type AnthropicUsage = Parameters<typeof normalizeAnthropicUsage>[0];

export function openAiMeta(res: { id?: string; model?: string; usage?: OpenAiUsage | null } | null | undefined): ProviderCallMeta {
  const u = res?.usage ?? {};
  return {
    usage: safe(() => normalizeOpenAiUsage(u), u.prompt_tokens ?? 0, u.completion_tokens ?? 0),
    responseModel: res?.model ?? null,
    providerRequestId: res?.id ?? null,
  };
}

export function anthropicMeta(res: { id?: string; model?: string; usage?: AnthropicUsage | null } | null | undefined): ProviderCallMeta {
  const u = res?.usage ?? {};
  return {
    usage: safe(() => normalizeAnthropicUsage(u), u.input_tokens ?? 0, u.output_tokens ?? 0),
    responseModel: res?.model ?? null,
    providerRequestId: res?.id ?? null,
  };
}

const BILLED = Symbol.for("tasks-ai.aiCost.billedUsage");

/**
 * Tag an error thrown after the provider already answered (a draft that
 * fails the schema, unparsable JSON) with the usage that response billed,
 * so runAiJob can record it as a `failed` cost event instead of dropping
 * spend the provider will still charge for.
 */
export function withBilledUsage<E>(err: E, meta: ProviderCallMeta): E {
  if (err && typeof err === "object" && meta.usage?.length) {
    (err as Record<symbol, unknown>)[BILLED] = meta;
  }
  return err;
}

export function billedUsageOf(err: unknown): ProviderCallMeta | null {
  if (err && typeof err === "object" && BILLED in err) {
    return ((err as Record<symbol, ProviderCallMeta>)[BILLED] as ProviderCallMeta) ?? null;
  }
  return null;
}
