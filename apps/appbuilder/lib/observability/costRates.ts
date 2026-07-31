/**
 * M13 slice G — token→USD rates for the *estimated* cost metric.
 *
 * This table is intentionally small, explicit, and overridable, because the
 * alternative implementations are all worse:
 *
 * - Hardcoding one blended rate would make the estimate silently wrong the
 *   moment a second model is configured.
 * - Fetching live pricing would make a metrics read do an outbound request
 *   to a vendor, which is both a new failure mode and a new egress surface.
 * - Deriving cost from the billing ledger would be accurate but circular:
 *   the ledger records usage, not price, and the price is what we lack.
 *
 * So: a checked-in table of published list prices, plus an env override for
 * operators on negotiated pricing. Every consumer must present the result as
 * an estimate (see metrics.ts#CostMetrics.estimated), and a model with no
 * entry produces no cost at all rather than a guessed one — an unrated model
 * is surfaced by name so the gap is visible instead of being absorbed into a
 * total that looks complete.
 *
 * Rates are USD per million tokens, list price. Update alongside a provider
 * change; a stale rate makes the estimate wrong, never the platform broken.
 */

import type { EnvLike } from "../features/env";

export interface ModelCostRate {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

export const MODEL_COST_RATES: Record<string, ModelCostRate> = {
  // The deterministic fake provider used by CI, the evaluation corpus, and
  // local development costs nothing — listed explicitly so a fake-provider
  // run reports "$0 with a known rate" rather than "unrated model", which
  // would otherwise fire a false gap signal on every test run.
  "fake-fixture-v1": { inputUsdPerMillion: 0, outputUsdPerMillion: 0 },
};

/**
 * `APPBUILDER_MODEL_COST_RATES` — a JSON object of
 * `{ "<model>": { "inputUsdPerMillion": n, "outputUsdPerMillion": n } }`,
 * merged over the table above. Parsed defensively: a malformed value
 * degrades that one model to "unrated" rather than throwing inside a
 * metrics read, because a bad pricing env var must never be able to take
 * down the dashboard an operator is using to diagnose something else.
 */
function envRates(env: EnvLike): Record<string, ModelCostRate> {
  const raw = env.APPBUILDER_MODEL_COST_RATES;
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, ModelCostRate> = {};
    for (const [model, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const input = (value as Record<string, unknown>).inputUsdPerMillion;
      const output = (value as Record<string, unknown>).outputUsdPerMillion;
      if (typeof input !== "number" || typeof output !== "number") continue;
      if (!Number.isFinite(input) || !Number.isFinite(output)) continue;
      if (input < 0 || output < 0) continue;
      out[model] = { inputUsdPerMillion: input, outputUsdPerMillion: output };
    }
    return out;
  } catch {
    return {};
  }
}

export function resolveCostRate(
  model: string,
  env: EnvLike = process.env
): ModelCostRate | null {
  const overrides = envRates(env);
  return overrides[model] ?? MODEL_COST_RATES[model] ?? null;
}
