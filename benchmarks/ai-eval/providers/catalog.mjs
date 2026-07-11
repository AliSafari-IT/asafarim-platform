/**
 * Provider-neutral model aliases. This benchmark deliberately does NOT name
 * real vendors or models: `frontier-a`, `balanced-b`, and `compact-c` are
 * capability-tier stand-ins. Real provider adapters would plug in behind these
 * aliases; the checked-in fixtures let the whole suite run offline with no keys.
 *
 * Pricing is illustrative $/1M tokens for a representative tier — used only to
 * compute a comparative estimated cost, never billed and never claimed live.
 *
 * @typedef {Object} ModelAlias
 * @property {string} id
 * @property {string} label
 * @property {string} tier
 * @property {number} priceInPerM   USD per 1M input tokens
 * @property {number} priceOutPerM  USD per 1M output tokens
 * @property {string} note
 */

/** @type {ModelAlias[]} */
export const models = [
  {
    id: "frontier-a",
    label: "Frontier A",
    tier: "frontier",
    priceInPerM: 5.0,
    priceOutPerM: 15.0,
    note: "Highest-capability tier stand-in — most accurate, most expensive, higher latency.",
  },
  {
    id: "balanced-b",
    label: "Balanced B",
    tier: "balanced",
    priceInPerM: 1.0,
    priceOutPerM: 3.0,
    note: "Mid tier — strong accuracy at a fraction of the cost.",
  },
  {
    id: "compact-c",
    label: "Compact C",
    tier: "compact",
    priceInPerM: 0.15,
    priceOutPerM: 0.6,
    note: "Smallest/cheapest/fastest tier — trades accuracy and robustness for price and latency.",
  },
];

/** @type {Record<string, ModelAlias>} */
export const modelById = Object.fromEntries(models.map((m) => [m.id, m]));

/** Estimated USD cost for one case, given token counts. */
export function caseCostUsd(modelId, tokensIn, tokensOut) {
  const m = modelById[modelId];
  if (!m) return 0;
  return (tokensIn / 1e6) * m.priceInPerM + (tokensOut / 1e6) * m.priceOutPerM;
}
