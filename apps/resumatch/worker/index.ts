/**
 * Standalone ResuMatch background worker.
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
 * app-prefixed `RESUMATCH_REDIS_URL`.
 *
 * The job-matching product's embedding/match-evaluation queues are gone
 * with the pivot to CV tailoring (see README.md) — this worker is
 * currently just the health-ping/noop substrate a future async job (e.g.
 * queueing a CV-rewrite call instead of awaiting it inline) would build on.
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";

// The worker is launched from the app directory (apps/resumatch); the
// platform keeps one shared .env at the monorepo root. Mirrors
// apps/tasks-ai/worker/index.ts and next.config.ts's own env loading.
loadEnv({ path: path.join(process.cwd(), "../../.env.local") });
loadEnv({ path: path.join(process.cwd(), "../../.env") });

import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { pingJobMatchDb } from "../lib/db/readiness";
import { getEnv } from "../lib/env";
import { log, logError } from "../lib/observability/logger";
import { buildWorkerHealth } from "./health";
import { JOB, QUEUE } from "./queues";

// Validates the environment contract (including the AI provider gate) and
// emits the boot-time "env.ai_provider" log line for this process.
getEnv();

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error(
    "REDIS_URL environment variable is required for the ResuMatch worker. " +
      "See apps/resumatch/README.md#environment.",
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

async function handleJob(job: Job): Promise<unknown> {
  if (job.name === JOB.healthPing) {
    const db = await pingJobMatchDb();
    const health = buildWorkerHealth(connection.status === "ready", db.ok);
    log.info("worker.health", health);
    return health;
  }
  if (job.name === JOB.noop) {
    // Proves the enqueue -> process -> complete loop end to end.
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
