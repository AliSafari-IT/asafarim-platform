import { createPricingRegistry, perMillionTokens, perUnits } from "@asafarim/ai-cost-ledger";

/**
 * ResuMatch's AI price table — the single place a per-token price lives.
 * Before issue #586 every provider adapter carried its own
 * `INPUT_USD_PER_TOKEN` constant, and the Anthropic ones applied Opus
 * pricing to whatever model `ANTHROPIC_MODEL` pointed at. Those adapter
 * constants are now ignored for spend; this table is read once per call
 * and the matched rate card is snapshotted onto the cost event, so a later
 * edit here never reprices history.
 *
 * **Bump `RESUMATCH_PRICING_VERSION` whenever a rate changes.** The version
 * string is what makes two snapshots distinguishable.
 *
 * Rates are USD per 1M tokens as published by each provider when this was
 * written — an *estimate* (costSource `registry_estimate`), not a billed
 * figure. Reconciliation against provider cost reports (#592) is what
 * catches drift. The `*` rows are provider-wide fallbacks that reproduce
 * the pre-#586 adapter constants, so an admin-selected model missing from
 * this table still gets the same estimate it always did — labelled with
 * tier `provider_default` so the UI can say so.
 */
export const RESUMATCH_PRICING_VERSION = "resumatch-2026-09-24";

const text = (input: string, cached: string, output: string, cacheWrite?: string) => [
  perMillionTokens("input", input),
  perMillionTokens("cached_input", cached),
  perMillionTokens("output", output),
  perMillionTokens("reasoning_output", output),
  ...(cacheWrite ? [perMillionTokens("cache_write_input", cacheWrite)] : []),
];

/** Hosted web-search tool (job fetch via the Responses API), per call. */
const webSearch = perUnits("tool_call", "calls", "0.025", 1);

export const resumatchPricing = createPricingRegistry(RESUMATCH_PRICING_VERSION, [
  { provider: "openai", model: "gpt-4o-mini*", rates: [...text("0.15", "0.075", "0.60"), webSearch] },
  { provider: "openai", model: "gpt-4o*", rates: [...text("2.50", "1.25", "10"), webSearch] },
  { provider: "openai", model: "gpt-4.1-nano*", rates: [...text("0.10", "0.025", "0.40"), webSearch] },
  { provider: "openai", model: "gpt-4.1-mini*", rates: [...text("0.40", "0.10", "1.60"), webSearch] },
  { provider: "openai", model: "gpt-4.1*", rates: [...text("2", "0.50", "8"), webSearch] },
  { provider: "openai", model: "*", tier: "provider_default", rates: [...text("0.15", "0.15", "0.60"), webSearch] },

  { provider: "anthropic", model: "claude-3-5-haiku*", rates: text("0.80", "0.08", "4", "1") },
  { provider: "anthropic", model: "claude-3-5-sonnet*", rates: text("3", "0.30", "15", "3.75") },
  { provider: "anthropic", model: "claude-3-7-sonnet*", rates: text("3", "0.30", "15", "3.75") },
  { provider: "anthropic", model: "claude-sonnet-4*", rates: text("3", "0.30", "15", "3.75") },
  { provider: "anthropic", model: "claude-opus-4*", rates: text("15", "1.50", "75", "18.75") },
  { provider: "anthropic", model: "claude-haiku-4-5*", rates: text("1", "0.10", "5", "1.25") },
  { provider: "anthropic", model: "*", tier: "provider_default", rates: text("15", "1.50", "75", "18.75") },
]);
