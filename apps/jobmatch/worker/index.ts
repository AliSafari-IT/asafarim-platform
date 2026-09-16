/**
 * Standalone JobMatch background worker (issue #246, M5 substrate).
 *
 * Mirrors `apps/tasks-ai/worker/index.ts`'s shape: a BullMQ Worker consuming
 * a `maintenance` queue, a heartbeat that proves the Redis + database
 * connections are alive, graceful shutdown on SIGTERM/SIGINT, and top-level
 * error handling so an unhandled rejection is logged instead of silently
 * killing the process.
 *
 * Deliberate deviation from tasks-ai: this reads the platform's shared
 * `REDIS_URL` directly (the same variable Vionto's and AppBuilder's workers
 * use — see apps/vionto/worker.ts, apps/appbuilder/worker.ts), not an
 * app-prefixed `JOBMATCH_REDIS_URL`. The issue calls for "Redis connection
 * from the existing platform REDIS_URL" rather than a new per-app contract,
 * so JobMatch does not get its own Redis instance the way it has its own
 * Postgres.
 *
 * No real matching work happens here. `match.evaluate` (JM-043) is
 * registered as a queue name only in `./queues.ts` — this worker does not
 * attach a processor to it yet.
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";

// The worker is launched from the app directory (apps/jobmatch); the
// platform keeps one shared .env at the monorepo root. Mirrors
// apps/tasks-ai/worker/index.ts and next.config.ts's own env loading.
loadEnv({ path: path.join(process.cwd(), "../../.env.local") });
loadEnv({ path: path.join(process.cwd(), "../../.env") });

import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { pingJobMatchDb } from "../lib/db/readiness";
import { log, logError } from "../lib/observability/logger";
import { buildWorkerHealth } from "./health";
import { JOB, QUEUE } from "./queues";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error(
    "REDIS_URL environment variable is required for the JobMatch worker. " +
      "See apps/jobmatch/README.md#environment.",
  );
}

const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});
// An unhandled ioredis 'error' event is re-thrown as an uncaught exception.
// ioredis reconnects on its own, so just log (mirrors apps/vionto/worker.ts
// and apps/appbuilder/worker.ts).
connection.on("error", (err) => {
  logError("worker.redis_error", err);
});

const maintenanceQueue = new Queue(QUEUE.maintenance, { connection });

// M5 substrate only: the queue is created so a producer (or JM-043's own
// worker registration) has somewhere to enqueue into, but no processor is
// attached. Real matching logic is explicitly out of scope for this issue.
const matchEvaluateQueue = new Queue(QUEUE.matchEvaluate, { connection });

async function handleJob(job: Job): Promise<unknown> {
  if (job.name === JOB.healthPing) {
    const db = await pingJobMatchDb();
    const health = buildWorkerHealth(connection.status === "ready", db.ok);
    log.info("worker.health", health);
    return health;
  }
  if (job.name === JOB.noop) {
    // Proves the enqueue -> process -> complete loop end to end, per the
    // issue's acceptance criteria. Intentionally does nothing else.
    log.info("worker.noop", { jobId: job.id });
    return { ok: true };
  }
  log.warn("worker.unknown_job", { jobId: job.id });
  return undefined;
}

const worker = new Worker(QUEUE.maintenance, handleJob, {
  connection,
  concurrency: 4,
});

worker.on("failed", (job, err) => {
  logError("worker.job_failed", err, { jobId: job?.id });
});

worker.on("ready", () => log.info("worker.ready"));

// Heartbeat: enqueue a health-ping every 60s so the worker's own liveness
// (and its view of Redis + the dedicated DB) is observable in logs, mirrors
// apps/tasks-ai/worker/index.ts.
const HEARTBEAT_MS = 60_000;
const heartbeat = setInterval(() => {
  maintenanceQueue
    .add(JOB.healthPing, {}, { removeOnComplete: 10, removeOnFail: 10 })
    .catch((err) => logError("worker.heartbeat_enqueue_failed", err));
}, HEARTBEAT_MS);

async function shutdown(signal: string): Promise<void> {
  log.info("worker.shutdown", { reasonCode: signal });
  clearInterval(heartbeat);
  await worker.close();
  await maintenanceQueue.close();
  await matchEvaluateQueue.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// A worker process that dies silently on an unhandled rejection is worse
// than one that crashes loudly: at least a loud crash restarts under a
// process manager and leaves a log line behind.
process.on("unhandledRejection", (reason) => {
  logError("worker.unhandled_rejection", reason instanceof Error ? reason : new Error(String(reason)));
});
process.on("uncaughtException", (err) => {
  logError("worker.uncaught_exception", err);
});

log.info("worker.started", { environment: process.env.NODE_ENV ?? "development" });
