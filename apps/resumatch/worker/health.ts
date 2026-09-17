export interface WorkerHealth {
  ok: boolean;
  service: "jobmatch-worker";
  checks: {
    redis: boolean;
    database: boolean;
  };
  timestamp: string;
}

/**
 * Pure over its probes so it is unit-testable without a real Redis or
 * database, mirroring `apps/tasks-ai/worker/health.ts`. The worker's
 * heartbeat job calls this every interval and logs the result.
 */
export function buildWorkerHealth(
  redisOk: boolean,
  databaseOk: boolean,
  now: Date = new Date(),
): WorkerHealth {
  const checks = { redis: redisOk, database: databaseOk };
  return {
    ok: Object.values(checks).every(Boolean),
    service: "jobmatch-worker",
    checks,
    timestamp: now.toISOString(),
  };
}
