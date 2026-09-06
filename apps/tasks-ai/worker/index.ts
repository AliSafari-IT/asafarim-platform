import path from "node:path";
import { config as loadEnv } from "dotenv";

// Match next.config.ts: the worker is launched from the app directory, and
// the platform keeps one shared .env at the monorepo root.
loadEnv({ path: path.join(process.cwd(), "../../.env.local") });
loadEnv({ path: path.join(process.cwd(), "../../.env") });

import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { getEnv } from "../lib/env";
import { pingTasksAiDb } from "../lib/db/readiness";
import { logger } from "../lib/observability/logger";
import { buildWorkerHealth } from "./health";
import { JOB, QUEUE } from "./queues";

const env = getEnv();

const connection = new IORedis(env.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

const maintenanceQueue = new Queue(QUEUE.maintenance, { connection });

const worker = new Worker(
  QUEUE.maintenance,
  async (job) => {
    if (job.name === JOB.healthPing) {
      const db = await pingTasksAiDb();
      const health = buildWorkerHealth(connection.status === "ready", db);
      logger.info({ health }, "worker.health");
      return health;
    }
    logger.warn({ job: job.name }, "worker.unknown_job");
  },
  { connection, concurrency: 4 },
);

worker.on("failed", (job, err) => {
  logger.error({ job: job?.name, err: err.message }, "worker.job_failed");
});

worker.on("ready", () => logger.info("worker.ready"));

// Heartbeat: enqueue a health-ping every 60s so the worker's own liveness
// (and its view of Redis + the dedicated DB) is observable in logs.
const HEARTBEAT_MS = 60_000;
const heartbeat = setInterval(() => {
  maintenanceQueue
    .add(JOB.healthPing, {}, { removeOnComplete: 10, removeOnFail: 10 })
    .catch((err) => logger.error({ err: String(err) }, "worker.heartbeat_enqueue_failed"));
}, HEARTBEAT_MS);

async function shutdown(signal: string) {
  logger.info({ signal }, "worker.shutdown");
  clearInterval(heartbeat);
  await worker.close();
  await maintenanceQueue.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

logger.info({ env: env.environment }, "worker.started");
