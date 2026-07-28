import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { QuotaExceededError } from "./errors";
import { resolveQuotaLimit } from "./overrides";
import { QUOTA_METRIC_SCOPE, type QuotaMetric } from "./limits";

/**
 * The race-safe quota enforcement primitive.
 *
 * MUST be called with `tx` as an ACTIVE transaction — ideally the very same
 * `db.transaction(async (tx) => ...)` callback that goes on to perform the
 * guarded insert. The Postgres transaction-scoped advisory lock taken here
 * is released automatically at COMMIT/ROLLBACK and is what actually makes
 * this race-safe: a bare `SELECT count(*)` immediately followed by an
 * `INSERT` is NOT sufficient on its own, because two concurrent
 * transactions (including two retries of the exact same logical request
 * racing each other) can both observe `count = limit - 1`, both decide
 * "under the limit", and both insert — landing at `limit + 1`. Serializing
 * on a per-(scope, metric) advisory lock forces the second transaction to
 * wait until the first COMMITS (at which point its insert is visible to the
 * second's recount) or ROLLS BACK (at which point nothing changed).
 *
 * `countCurrent` MUST run its query against this same `tx` (not a fresh
 * connection) so counting and the guarded write are part of one atomic
 * unit; it re-derives the count from persisted rows every call — there is
 * deliberately no separately-maintained counter that could drift.
 *
 * Idempotent retries: because the count is re-derived from the actual rows
 * a caller's own idempotency check already prevents from duplicating (see
 * e.g. lib/repositories/apps.ts#createApp's `idempotencyKeys` check, which
 * runs earlier in the same transaction and returns the original row without
 * reaching `withQuota` again on a genuine retry), a retried request never
 * double-consumes quota — it either short-circuits before this call or
 * recreates the exact same non-duplicate row.
 */
export async function withQuota<T>(
  tx: Db,
  scopeId: string,
  metric: QuotaMetric,
  countCurrent: () => Promise<number>,
  run: () => Promise<T>
): Promise<T> {
  const lockKey = `quota:${QUOTA_METRIC_SCOPE[metric]}:${scopeId}:${metric}`;
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`
  );

  const limit = await resolveQuotaLimit(
    tx,
    QUOTA_METRIC_SCOPE[metric],
    scopeId,
    metric
  );
  const current = await countCurrent();
  if (current >= limit) {
    throw new QuotaExceededError(metric, limit, current);
  }
  return run();
}

/**
 * A read-only check (no lock, no write) for surfacing "N/limit" in the
 * readiness UI. NEVER use this to gate a write — it has no race-safety
 * guarantee on its own (see `withQuota`'s docstring); it exists purely for
 * display.
 */
export async function checkQuotaSnapshot(
  db: Db,
  scopeId: string,
  metric: QuotaMetric,
  countCurrent: () => Promise<number>
): Promise<{
  metric: QuotaMetric;
  limit: number;
  current: number;
  exceeded: boolean;
}> {
  const [limit, current] = await Promise.all([
    resolveQuotaLimit(db, QUOTA_METRIC_SCOPE[metric], scopeId, metric),
    countCurrent(),
  ]);
  return { metric, limit, current, exceeded: current >= limit };
}
