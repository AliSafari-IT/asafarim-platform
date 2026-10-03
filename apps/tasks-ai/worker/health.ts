import type { DbReadiness } from "../lib/db/readiness";

export interface WorkerHealth {
  ok: boolean;
  service: "tasks-ai-worker";
  checks: {
    redis: boolean;
    database: boolean;
    /** No job has failed UNHEALTHY_AFTER times in a row (#787). */
    jobs: boolean;
  };
  /** Jobs currently failing repeatedly, by name. */
  unhealthyJobs: string[];
  timestamp: string;
}

/**
 * Pure over its probes so it is unit-testable without a real Redis or
 * database. The worker's `/healthz` (or a periodic log line) calls this.
 */
export function buildWorkerHealth(
  redisOk: boolean,
  db: DbReadiness,
  unhealthyJobs: string[] = [],
  now: Date = new Date(),
): WorkerHealth {
  const checks = { redis: redisOk, database: db.ok, jobs: unhealthyJobs.length === 0 };
  return {
    ok: Object.values(checks).every(Boolean),
    service: "tasks-ai-worker",
    checks,
    unhealthyJobs,
    timestamp: now.toISOString(),
  };
}
