import type { PrismaClient } from "../db/generated";
import type { CallOutcome } from "./callOutcome";

/**
 * Reliability report over `ai_call_outcomes` (issue #512): per provider-call
 * kind and rolling window, how many calls ran, how many succeeded, degraded
 * or used a fallback provider, and the average number of attempts.
 * Read-only. Run it with `pnpm --filter @asafarim/resumatch report:ai-outcomes`.
 */

/** One `groupBy` bucket: calls of one kind with the same outcome and
 *  fallback flag. */
export interface OutcomeBucket {
  kind: string;
  outcome: string;
  usedFallback: boolean;
  calls: number;
  attemptsSum: number;
}

export interface KindReliability {
  kind: string;
  calls: number;
  /** Share of calls, 0–1, rounded to 4 decimals. */
  successRate: number;
  degradeRate: number;
  fallbackRate: number;
  /** Average provider attempts per call, rounded to 2 decimals. Calls that
   *  ended before the first attempt count as 0. */
  avgAttempts: number;
  /** Calls per outcome; outcomes with no calls are left out. */
  byOutcome: Partial<Record<CallOutcome, number>> & Record<string, number>;
}

export interface WindowReport {
  window: string;
  since: string;
  kinds: KindReliability[];
}

export const REPORT_WINDOWS = [
  { name: "24h", ms: 24 * 60 * 60 * 1000 },
  { name: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
] as const;

const round = (value: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

/** Pure: folds buckets into one reliability row per kind, sorted by kind. */
export function summarizeOutcomes(buckets: readonly OutcomeBucket[]): KindReliability[] {
  const byKind = new Map<
    string,
    { calls: number; success: number; fallback: number; attempts: number; byOutcome: Record<string, number> }
  >();
  for (const b of buckets) {
    if (b.calls <= 0) continue;
    const row = byKind.get(b.kind) ?? { calls: 0, success: 0, fallback: 0, attempts: 0, byOutcome: {} };
    row.calls += b.calls;
    row.attempts += b.attemptsSum;
    if (b.outcome === "success") row.success += b.calls;
    if (b.usedFallback) row.fallback += b.calls;
    row.byOutcome[b.outcome] = (row.byOutcome[b.outcome] ?? 0) + b.calls;
    byKind.set(b.kind, row);
  }
  return [...byKind.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, r]) => ({
      kind,
      calls: r.calls,
      successRate: round(r.success / r.calls, 4),
      degradeRate: round((r.calls - r.success) / r.calls, 4),
      fallbackRate: round(r.fallback / r.calls, 4),
      avgAttempts: round(r.attempts / r.calls, 2),
      byOutcome: r.byOutcome,
    }));
}

type OutcomeDb = Pick<PrismaClient, "aiCallOutcome">;

/** Reads one window's buckets with a single `groupBy`. No row content
 *  beyond kind, outcome, fallback flag and counts is selected. */
export async function loadOutcomeBuckets(db: OutcomeDb, since: Date): Promise<OutcomeBucket[]> {
  const groups = await db.aiCallOutcome.groupBy({
    by: ["kind", "outcome", "usedFallback"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
    _sum: { attempts: true },
  });
  return groups.map((g) => ({
    kind: g.kind,
    outcome: g.outcome,
    usedFallback: g.usedFallback,
    calls: g._count._all,
    attemptsSum: g._sum.attempts ?? 0,
  }));
}

export async function buildOutcomeReport(db: OutcomeDb, now: Date): Promise<WindowReport[]> {
  const reports: WindowReport[] = [];
  for (const w of REPORT_WINDOWS) {
    const since = new Date(now.getTime() - w.ms);
    reports.push({
      window: w.name,
      since: since.toISOString(),
      kinds: summarizeOutcomes(await loadOutcomeBuckets(db, since)),
    });
  }
  return reports;
}
