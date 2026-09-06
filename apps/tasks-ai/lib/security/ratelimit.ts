import "server-only";
import type { PrismaClient } from "../db/generated";
import { ApiError } from "../errors";

/**
 * Fixed-window rate limiter backed by a `RateCounter` row per bucket. Cheap
 * and good enough for privileged-op and write-burst protection; the sharper
 * sliding-window limiter is a follow-up. Fails **open** on a DB error — a
 * limiter outage must not take the API down.
 */
export interface Limit {
  key: string;
  max: number;
  windowSec: number;
}

export async function consume(db: PrismaClient, limit: Limit): Promise<{ remaining: number }> {
  const now = new Date();
  const windowEnd = new Date(Math.ceil(now.getTime() / (limit.windowSec * 1000)) * limit.windowSec * 1000);
  const bucketKey = `${limit.key}:${windowEnd.getTime()}`;
  try {
    const row = await db.rateCounter.upsert({
      where: { bucketKey },
      create: { bucketKey, count: 1, windowEnd },
      update: { count: { increment: 1 } },
    });
    if (row.count > limit.max) {
      throw new ApiError("rate_limited", {
        retryAfterSec: Math.ceil((windowEnd.getTime() - now.getTime()) / 1000),
      });
    }
    return { remaining: Math.max(0, limit.max - row.count) };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    return { remaining: limit.max }; // fail open
  }
}

/** Housekeeping: drop expired counters. Called by the worker. */
export async function pruneRateCounters(db: PrismaClient): Promise<number> {
  const res = await db.rateCounter.deleteMany({ where: { windowEnd: { lt: new Date(Date.now() - 3600_000) } } });
  return res.count;
}
