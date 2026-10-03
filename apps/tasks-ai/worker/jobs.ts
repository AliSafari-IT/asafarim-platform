import { logger } from "../lib/observability/logger";
import { drainOutboxOnce } from "./outbox";

/**
 * The worker's periodic jobs, in one list so the worker (index.ts) and the
 * CI smoke test (smoke.ts) run exactly the same code (#787). Each `run` does
 * one cycle and returns a summary; the modules are imported lazily, as before.
 */
export interface WorkerJob {
  name: string;
  intervalMs: number;
  /** The error log message, unchanged from before #787 so log searches keep working. */
  failMsg: string;
  run: () => Promise<unknown>;
  /** Log line for a cycle that did something; omit to log nothing on success. */
  report?: (result: unknown) => { fields: Record<string, unknown>; msg: string } | null;
}

async function db() {
  const { getTasksAiDb } = await import("../lib/db/client");
  return getTasksAiDb();
}

export const WORKER_JOBS: readonly WorkerJob[] = [
  {
    // Outbox drainer: notification dispatch, automation fan-out (docs/adr/0005).
    name: "outbox",
    intervalMs: 2000,
    failMsg: "outbox.drain_failed",
    run: () => drainOutboxOnce(),
    report: (r) => {
      const { processed, dead } = r as { processed: number; dead: number };
      return processed || dead ? { fields: { processed, dead }, msg: "outbox.drained" } : null;
    },
  },
  {
    // Webhook delivery (M09): signed POSTs with exponential backoff + dead-letter.
    name: "webhooks",
    intervalMs: 3000,
    failMsg: "webhooks.drain_failed",
    run: async () => {
      const { drainWebhooksOnce } = await import("../lib/webhooks/service");
      return drainWebhooksOnce(await db());
    },
    report: (r) => {
      const result = r as { delivered: number; dead: number };
      return result.delivered || result.dead ? { fields: { ...result }, msg: "webhooks.drained" } : null;
    },
  },
  {
    // Housekeeping (M12): prune expired rate-limit counters hourly.
    name: "ratecounters",
    intervalMs: 3_600_000,
    failMsg: "ratecounters.prune_failed",
    run: async () => {
      const { pruneRateCounters } = await import("../lib/security/ratelimit");
      return pruneRateCounters(await db());
    },
    report: (n) => (n ? { fields: { pruned: n }, msg: "ratecounters.pruned" } : null),
  },
  {
    // Proactive daily brief delivery (issue #242): every opted-in member gets
    // one push to the notification inbox per local morning. The sweep skips
    // anyone whose local time isn't morning, is in quiet hours, or already saw
    // today's brief via the pull endpoint.
    name: "brief_delivery",
    intervalMs: 15 * 60_000,
    failMsg: "brief_delivery.sweep_failed",
    run: async () => {
      const { runBriefDeliverySweep } = await import("../lib/intel/brief-delivery");
      return runBriefDeliverySweep(await db());
    },
    report: (r) => {
      const results = r as { delivered: boolean }[];
      if (!results.length) return null;
      return { fields: { candidates: results.length, delivered: results.filter((x) => x.delivered).length }, msg: "brief_delivery.swept" };
    },
  },
];

/** Consecutive failures after which a job is reported unhealthy. */
export const UNHEALTHY_AFTER = 5;

/**
 * Tracks consecutive failures per job (#787: a job failed every 3 s for weeks
 * and only ever logged the same error). The first failure logs the error as
 * before; reaching UNHEALTHY_AFTER logs one `worker.job_unhealthy` (an alert
 * line) and marks the job unhealthy in the heartbeat until it succeeds again,
 * which logs `worker.job_recovered`.
 */
export class JobFailureTracker {
  private readonly failures = new Map<string, number>();

  constructor(private readonly log: Pick<typeof logger, "error" | "info"> = logger) {}

  succeeded(job: string): void {
    const before = this.failures.get(job) ?? 0;
    this.failures.delete(job);
    if (before >= UNHEALTHY_AFTER) this.log.info({ job, failures: before }, "worker.job_recovered");
  }

  failed(job: string, err: unknown, msg = `${job}.failed`): void {
    const count = (this.failures.get(job) ?? 0) + 1;
    this.failures.set(job, count);
    this.log.error({ job, err: String(err), consecutive: count }, msg);
    if (count === UNHEALTHY_AFTER) this.log.error({ job, consecutive: count }, "worker.job_unhealthy");
  }

  /** Jobs at or past the threshold, for the heartbeat. */
  unhealthy(): string[] {
    return [...this.failures].filter(([, n]) => n >= UNHEALTHY_AFTER).map(([job]) => job);
  }
}

/** One cycle of a job, with failure tracking and its success log line. */
export async function runCycle(job: WorkerJob, tracker: JobFailureTracker, log: Pick<typeof logger, "info"> = logger) {
  try {
    const result = await job.run();
    tracker.succeeded(job.name);
    const line = job.report?.(result);
    if (line) log.info(line.fields, line.msg);
  } catch (err) {
    tracker.failed(job.name, err, job.failMsg);
  }
}
