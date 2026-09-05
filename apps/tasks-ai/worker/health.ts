import type { DbReadiness } from "../lib/db/readiness";

export interface WorkerHealth {
  ok: boolean;
  service: "tasks-ai-worker";
  checks: {
    redis: boolean;
    database: boolean;
  };
  timestamp: string;
}

/**
 * Pure over its probes so it is unit-testable without a real Redis or
 * database. The worker's `/healthz` (or a periodic log line) calls this.
 */
export function buildWorkerHealth(
  redisOk: boolean,
  db: DbReadiness,
  now: Date = new Date(),
): WorkerHealth {
  const checks = { redis: redisOk, database: db.ok };
  return {
    ok: Object.values(checks).every(Boolean),
    service: "tasks-ai-worker",
    checks,
    timestamp: now.toISOString(),
  };
}
