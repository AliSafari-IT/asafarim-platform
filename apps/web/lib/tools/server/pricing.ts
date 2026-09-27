import "server-only";
import { createPricingRegistry, perMillionTokens, type PriceTableEntry } from "@asafarim/ai-cost-ledger";

/**
 * Web's price table for public AI tools (Anthropic first-party list prices,
 * USD). Cache reads bill at 0.1× input and 5-minute cache writes at 1.25×.
 * Snapshots are captured per event, so editing this table never reprices
 * history; bump the version whenever a rate changes.
 *
 * Every model a tool may be configured to use — and every model the
 * server-side refusal fallback may route to — must be listed, or its runs
 * are recorded with an unknown cost and refused up front by the spend check.
 */
export const WEB_PRICING_VERSION = "web-tools-2026-09-27";

function anthropic(model: string, inputUsd: number, outputUsd: number): PriceTableEntry {
  return {
    provider: "anthropic",
    model,
    rates: [
      perMillionTokens("input", inputUsd),
      perMillionTokens("cached_input", inputUsd * 0.1),
      perMillionTokens("cache_write_input", inputUsd * 1.25),
      perMillionTokens("output", outputUsd),
    ],
  };
}

export const webPricing = createPricingRegistry(WEB_PRICING_VERSION, [
  anthropic("claude-opus-5", 5, 25),
  anthropic("claude-opus-4-8", 5, 25),
  anthropic("claude-sonnet-5", 2, 10),
  anthropic("claude-haiku-4-5", 1, 5),
]);
