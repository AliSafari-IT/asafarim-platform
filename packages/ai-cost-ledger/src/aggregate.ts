import { assertMicrosInRange } from "./money";
import type { CostSource, CredentialSource, EntryType } from "./event";
import type { UsageLine } from "./usage";
import { totalInputTokens, totalOutputTokens } from "./usage";

/**
 * Effective-cost resolution and aggregation.
 *
 * Rules (ADR 0003 §Effective cost):
 *  1. fixture → genuine 0 ("free/fixture"), counted as known.
 *  2. actualCostMicros present → that amount ("actual").
 *  3. estimatedCostMicros present → that amount ("estimated").
 *  4. otherwise → unknown. Contributes to `unknownCount`, **never** to an
 *     amount — a total is always "known amount + N unknown", not a sum
 *     that silently treats unknown as $0.
 *  5. adjustment rows add their signed delta to the amount totals but are
 *     not events for count/coverage purposes — the row they correct
 *     already counted once.
 *
 * The minimal row shape lets an app aggregate straight from a narrow
 * `SELECT` without loading usage details it does not need.
 */
export interface AggregatableRow {
  entryType: EntryType;
  estimatedCostMicros: bigint | null;
  actualCostMicros: bigint | null;
  adjustmentDeltaMicros: bigint | null;
  costSource: CostSource;
  credentialSource: CredentialSource;
  fixture: boolean;
  /** Imported from a pre-contract float ledger; counted but flagged partial. */
  legacy?: boolean;
  usage?: readonly UsageLine[];
  /** Fallback token counts when `usage` detail is not loaded. */
  inputTokens?: number;
  outputTokens?: number;
}

export type CostBasis = "actual" | "estimated" | "fixture" | "unknown" | "adjustment";

export interface EffectiveCost {
  amountMicros: bigint | null;
  basis: CostBasis;
}

export function effectiveCost(row: AggregatableRow): EffectiveCost {
  if (row.entryType === "adjustment") return { amountMicros: row.adjustmentDeltaMicros ?? BigInt("0"), basis: "adjustment" };
  if (row.fixture) return { amountMicros: BigInt("0"), basis: "fixture" };
  if (row.actualCostMicros !== null) return { amountMicros: row.actualCostMicros, basis: "actual" };
  if (row.estimatedCostMicros !== null) return { amountMicros: row.estimatedCostMicros, basis: "estimated" };
  return { amountMicros: null, basis: "unknown" };
}

export interface CostTotals {
  /** Usage events (adjustments excluded). */
  eventCount: number;
  knownCount: number;
  unknownCount: number;
  actualCount: number;
  estimatedCount: number;
  fixtureCount: number;
  legacyCount: number;
  adjustmentCount: number;
  /** Σ known amounts + adjustment deltas. */
  effectiveKnownMicros: bigint;
  actualMicros: bigint;
  estimatedMicros: bigint;
  adjustmentMicros: bigint;
  /** Portion of effectiveKnownMicros paid with the user's own key. */
  byokMicros: bigint;
  platformMicros: bigint;
  inputTokens: number;
  outputTokens: number;
}

export function emptyTotals(): CostTotals {
  return {
    eventCount: 0,
    knownCount: 0,
    unknownCount: 0,
    actualCount: 0,
    estimatedCount: 0,
    fixtureCount: 0,
    legacyCount: 0,
    adjustmentCount: 0,
    effectiveKnownMicros: BigInt("0"),
    actualMicros: BigInt("0"),
    estimatedMicros: BigInt("0"),
    adjustmentMicros: BigInt("0"),
    byokMicros: BigInt("0"),
    platformMicros: BigInt("0"),
    inputTokens: 0,
    outputTokens: 0,
  };
}

/** Mutates and returns `totals`; all bigint additions are range-checked. */
export function addRow(totals: CostTotals, row: AggregatableRow): CostTotals {
  const { amountMicros, basis } = effectiveCost(row);
  if (basis === "adjustment") {
    totals.adjustmentCount += 1;
    totals.adjustmentMicros = assertMicrosInRange(totals.adjustmentMicros + (amountMicros ?? BigInt("0")));
    totals.effectiveKnownMicros = assertMicrosInRange(totals.effectiveKnownMicros + (amountMicros ?? BigInt("0")));
    return totals;
  }

  totals.eventCount += 1;
  if (row.legacy) totals.legacyCount += 1;
  if (row.usage) {
    totals.inputTokens += totalInputTokens(row.usage);
    totals.outputTokens += totalOutputTokens(row.usage);
  } else {
    totals.inputTokens += row.inputTokens ?? 0;
    totals.outputTokens += row.outputTokens ?? 0;
  }

  if (amountMicros === null) {
    totals.unknownCount += 1;
    return totals;
  }
  totals.knownCount += 1;
  totals.effectiveKnownMicros = assertMicrosInRange(totals.effectiveKnownMicros + amountMicros);
  if (basis === "fixture") totals.fixtureCount += 1;
  if (basis === "actual") {
    totals.actualCount += 1;
    totals.actualMicros = assertMicrosInRange(totals.actualMicros + amountMicros);
  }
  if (basis === "estimated") {
    totals.estimatedCount += 1;
    totals.estimatedMicros = assertMicrosInRange(totals.estimatedMicros + amountMicros);
  }
  if (row.credentialSource === "user_byok") totals.byokMicros = assertMicrosInRange(totals.byokMicros + amountMicros);
  if (row.credentialSource === "platform") totals.platformMicros = assertMicrosInRange(totals.platformMicros + amountMicros);
  return totals;
}

export function mergeTotals(a: CostTotals, b: CostTotals): CostTotals {
  const out = emptyTotals();
  for (const key of Object.keys(out) as (keyof CostTotals)[]) {
    const av = a[key];
    const bv = b[key];
    (out as unknown as Record<string, bigint | number>)[key] =
      typeof av === "bigint" ? assertMicrosInRange(av + (bv as bigint)) : (av as number) + (bv as number);
  }
  return out;
}

export function summarize(rows: Iterable<AggregatableRow>): CostTotals {
  const totals = emptyTotals();
  for (const row of rows) addRow(totals, row);
  return totals;
}

/**
 * Coverage in basis points (0–10000): share of usage events whose cost is
 * known. null when there are no events — "no data" is not "100% covered".
 */
export function coverageBasisPoints(totals: CostTotals): number | null {
  if (totals.eventCount === 0) return null;
  return Math.floor((totals.knownCount * 10_000) / totals.eventCount);
}

export type CoverageStatus = "empty" | "complete" | "partial" | "unknown";

export function coverageStatus(totals: CostTotals): CoverageStatus {
  if (totals.eventCount === 0) return "empty";
  if (totals.unknownCount === 0 && totals.legacyCount === 0) return "complete";
  if (totals.knownCount === 0) return "unknown";
  return "partial";
}

export interface CostGroup<K extends string = string> {
  key: K;
  totals: CostTotals;
}

/**
 * Group rows by exactly one key each, so Σ group subtotals ≡ grand total
 * for the same filter. A row that belongs to "no group" must be given an
 * explicit key (e.g. `"unattributed"`), never dropped.
 */
export function groupTotals<R extends AggregatableRow, K extends string>(
  rows: Iterable<R>,
  keyOf: (row: R) => K,
): { groups: CostGroup<K>[]; total: CostTotals } {
  const map = new Map<K, CostTotals>();
  const total = emptyTotals();
  for (const row of rows) {
    const key = keyOf(row);
    const bucket = map.get(key) ?? emptyTotals();
    addRow(bucket, row);
    map.set(key, bucket);
    addRow(total, row);
  }
  return { groups: [...map.entries()].map(([key, totals]) => ({ key, totals })), total };
}
