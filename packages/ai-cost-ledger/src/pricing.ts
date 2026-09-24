import { z } from "zod";
import { multiplyRate, sumMicros, toMicros } from "./money";
import { USAGE_BUCKETS, USAGE_UNITS, type UsageBucket, type UsageLine, type UsageUnit } from "./usage";

/**
 * Pricing snapshots.
 *
 * A snapshot is the exact rate card used to estimate an event's cost,
 * captured **at generation time** and persisted with the event. History is
 * never repriced from today's table: if a registry price changes, old
 * events keep the snapshot they were written with, and only new events see
 * the new price. Drift between an estimate and what the provider actually
 * billed is handled by reconciliation adjustments (see `event.ts`), not by
 * editing the snapshot.
 *
 * Each app owns its own price table (they call different models); this
 * module only defines the shape and the arithmetic.
 */

const IntegerString = z
  .string()
  .regex(/^\d+$/, "must be a non-negative base-10 integer string");

export const RateSchema = z
  .object({
    bucket: z.enum(USAGE_BUCKETS),
    unit: z.enum(USAGE_UNITS),
    /** Price in USD micros for `per` units, stored as a string so it
     *  survives JSON round-trips without float coercion. */
    rateMicros: IntegerString,
    per: IntegerString,
  })
  .strict();
export type Rate = z.infer<typeof RateSchema>;

export const PricingSnapshotSchema = z
  .object({
    /** Version of the table the rate came from, e.g. `resumatch-2026-09-24`. */
    pricingVersion: z.string().min(1).max(80),
    provider: z.string().min(1).max(80),
    /** The table entry that matched — may be a prefix pattern like `gpt-4.1*`. */
    model: z.string().min(1).max(160),
    tier: z.string().max(40).nullable().default(null),
    currency: z.literal("USD"),
    rates: z.array(RateSchema).min(1),
  })
  .strict();
export type PricingSnapshot = z.infer<typeof PricingSnapshotSchema>;

export interface PriceTableEntry {
  provider: string;
  /** Exact model id, or a prefix ending in `*` (`claude-sonnet-*`). */
  model: string;
  tier?: string | null;
  rates: Rate[];
}

/** `$X per 1M tokens` → a token Rate. Accepts a decimal string or number of dollars. */
export function perMillionTokens(bucket: UsageBucket, usdPerMillion: string | number): Rate {
  return perUnits(bucket, "tokens", usdPerMillion, 1_000_000);
}

/** `$X per N units` → a Rate. */
export function perUnits(bucket: UsageBucket, unit: UsageUnit, usd: string | number, per: number): Rate {
  const text = typeof usd === "number" ? usd.toFixed(7) : usd;
  const [whole, frac = ""] = text.split(".");
  const padded = (frac + "000000").slice(0, 6);
  const rateMicros = BigInt(whole) * BigInt("1000000") + BigInt(padded);
  return { bucket, unit, rateMicros: rateMicros.toString(), per: String(per) };
}

export interface PricingRegistry {
  readonly version: string;
  /** The rate card for this provider/model, or null when it is unpriced. */
  lookup(provider: string, model: string): PricingSnapshot | null;
}

export function createPricingRegistry(version: string, entries: readonly PriceTableEntry[]): PricingRegistry {
  return {
    version,
    lookup(provider, model) {
      const candidates = entries.filter((e) => e.provider === provider);
      const exact = candidates.find((e) => e.model === model);
      const prefix = exact
        ? undefined
        : candidates
            .filter((e) => e.model.endsWith("*") && model.startsWith(e.model.slice(0, -1)))
            // Longest prefix wins so `gpt-4.1-mini*` beats `gpt-4.1*`.
            .sort((a, b) => b.model.length - a.model.length)[0];
      const hit = exact ?? prefix;
      if (!hit) return null;
      return {
        pricingVersion: version,
        provider,
        model: hit.model,
        tier: hit.tier ?? null,
        currency: "USD",
        rates: hit.rates.map((r) => ({ ...r })),
      };
    },
  };
}

export interface CostEstimate {
  /** null = unknown: at least one non-zero usage line had no rate. Never 0 in that case. */
  costMicros: bigint | null;
  unpricedBuckets: `${UsageBucket}:${UsageUnit}`[];
}

/**
 * Σ(quantity × rate) over exclusive usage buckets. If **any** non-zero
 * usage line has no matching rate, the whole estimate is unknown rather
 * than a partial sum presented as complete — an under-count that looks
 * precise is worse than an honest "not tracked".
 *
 * There is deliberately no fallback from `cached_input` to the `input`
 * rate: a table that wants that must say so explicitly.
 */
export function estimateCost(usage: readonly UsageLine[], snapshot: PricingSnapshot): CostEstimate {
  const unpriced: CostEstimate["unpricedBuckets"] = [];
  const parts: bigint[] = [];
  for (const line of usage) {
    if (line.quantity === 0) continue;
    const rate = snapshot.rates.find((r) => r.bucket === line.bucket && r.unit === line.unit);
    if (!rate) {
      unpriced.push(`${line.bucket}:${line.unit}`);
      continue;
    }
    parts.push(multiplyRate(BigInt(line.quantity), toMicros(rate.rateMicros), toMicros(rate.per)));
  }
  return { costMicros: unpriced.length > 0 ? null : sumMicros(parts), unpricedBuckets: unpriced };
}
