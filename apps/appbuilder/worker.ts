/**
 * Standalone AppBuilder generation worker process — NOT run inside the
 * Next.js web server. Consumes BullMQ dispatch messages from
 * lib/server/queue.ts, claims the corresponding row in `generation_jobs`
 * (Postgres is the durable source of truth — see
 * lib/repositories/generationJobs.ts), and drives it forward through
 * lib/generation/pipeline.ts. A periodic sweep also claims any job whose
 * lease has expired or that never received a dispatch message at all, so
 * correctness never depends on Redis/BullMQ delivery.
 *
 * Run locally with `pnpm --filter @asafarim/appbuilder worker:dev` (tsup
 * `--watch` + rerunning the bundled `worker-dist/worker.js` on every
 * change — env vars come from `./lib/server/loadDevEnv`, imported first
 * below); built for production the same way via `worker:build`,
 * containerized by a dedicated Dockerfile target (see
 * docs/appbuilder-m07-ai-generation.md#worker-deployment). Deliberately
 * NOT run via plain `tsx worker.ts` even in dev: this file transitively
 * imports .tsx components from @asafarim/appbuilder-runtime and
 * @asafarim/ui (through requestPreviewBuild's renderPreview call), and
 * tsx's per-file JSX-transform resolution does not reliably pick up the
 * automatic JSX runtime across package boundaries outside a real bundler,
 * producing a `ReferenceError: React is not defined` at render time.
 * Always dev/test against the same bundled artifact production runs.
 */
import "./lib/server/loadDevEnv"; // must run before any other import reads process.env
import { createServer } from "node:http";
import { eq, sql } from "drizzle-orm";
import { Worker, type Job } from "bullmq";
import Redis from "ioredis";
import { createProviderFromConfig, loadAiProviderConfig, safeConfigSummary, buildSafeSummary } from "@asafarim/appbuilder-ai";
import { getDb, closeDb } from "./lib/db/client";
import { generationJobs } from "./lib/db/schema";
import {
  claimJobById,
  claimNextAvailableJob,
  type GenerationJobRow,
} from "./lib/repositories/generationJobs";
import { runGenerationJob } from "./lib/generation/pipeline";
import { GENERATION_LIMITS } from "./lib/generation/limits";
import { computeBackoffDelayMs } from "./lib/generation/backoff";
import { GENERATION_QUEUE_NAME, nudgeWorker, type GenerationDispatchMessage } from "./lib/server/queue";

const WORKER_ID = `appbuilder-worker:${process.pid}:${Math.random().toString(36).slice(2, 8)}`;
const CONCURRENCY = Number.parseInt(process.env.APPBUILDER_WORKER_CONCURRENCY ?? "2", 10);
const HEALTH_PORT = Number.parseInt(process.env.APPBUILDER_WORKER_HEALTH_PORT ?? "3008", 10);
const LEASE_DURATION_MS = GENERATION_LIMITS.DEFAULT_LEASE_DURATION_MS;
const SWEEP_INTERVAL_MS = GENERATION_LIMITS.STALE_LEASE_SWEEP_INTERVAL_MS;

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error("REDIS_URL is required to run the AppBuilder worker.");
}
const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });

let isShuttingDown = false;
let activeJobCount = 0;

async function processClaimedJob(job: GenerationJobRow): Promise<void> {
  activeJobCount += 1;
  const controller = new AbortController();

  // Tighter-than-checkpoint cancellation: while this job is actively being
  // processed, poll for a cooperative cancellation request every few
  // seconds and abort any in-flight provider call immediately, rather than
  // waiting for the current phase to finish naturally.
  const cancelWatcher = setInterval(async () => {
    try {
      const db = getDb();
      const [row] = await db.select().from(generationJobs).where(eq(generationJobs.id, job.id)).limit(1);
      if (row?.cancelRequestedAt) controller.abort();
    } catch {
      // Best-effort — a failed poll never blocks processing; the next
      // phase-boundary checkpoint in the pipeline will still catch it.
    }
  }, 3_000);

  try {
    const provider = createProviderFromConfig(loadAiProviderConfig());
    const outcome = await runGenerationJob(
      { db: getDb(), provider, workerId: WORKER_ID, leaseDurationMs: LEASE_DURATION_MS, signal: controller.signal },
      job,
    );

    if (outcome.kind === "retry_later") {
      const delayMs = computeBackoffDelayMs(outcome.job.attemptCount);
      console.warn(
        `[appbuilder-worker] job ${job.id} failed retryably (${outcome.error.code}); retrying in ~${delayMs}ms (attempt ${outcome.job.attemptCount}/${GENERATION_LIMITS.MAX_JOB_ATTEMPTS})`,
        // Operator diagnostic only (never persisted, never shown to the
        // end user — see lib/generation/errors.ts) — redacted defensively
        // since `cause` may wrap a raw SDK/DB error.
        buildSafeSummary({ cause: String(outcome.error.cause ?? "") }),
      );
      await nudgeWorker(job.id, { cause: "retry", attempt: outcome.job.attemptCount, delayMs });
    } else if (outcome.kind === "lease_lost") {
      console.warn(`[appbuilder-worker] lost lease on job ${job.id} mid-processing; another worker owns it now`);
    } else {
      console.log(`[appbuilder-worker] job ${job.id} -> ${outcome.job.status} (${outcome.job.phase})`);
    }
  } catch (err) {
    console.error(`[appbuilder-worker] unhandled error processing job ${job.id}:`, err);
  } finally {
    clearInterval(cancelWatcher);
    activeJobCount -= 1;
  }
}

const worker = new Worker<GenerationDispatchMessage>(
  GENERATION_QUEUE_NAME,
  async (bullJob: Job<GenerationDispatchMessage>) => {
    const { jobId } = bullJob.data;
    const claimed = await claimJobById(getDb(), jobId, WORKER_ID, LEASE_DURATION_MS);
    if (!claimed) {
      // Already claimed by another worker, already terminal, or awaiting
      // clarification — nothing to do; not an error.
      return;
    }
    await processClaimedJob(claimed);
  },
  { connection: redis, concurrency: CONCURRENCY },
);

worker.on("failed", (bullJob, err) => {
  console.error(`[appbuilder-worker] BullMQ job ${bullJob?.id} failed:`, err);
});

// Crash-recovery sweep: picks up jobs whose lease expired (previous worker
// died mid-processing) or that never got a BullMQ dispatch message at all
// (e.g. Redis restarted without persistence). Correctness of "every
// non-terminal job eventually completes" depends on this, not on Redis.
const sweepInterval = setInterval(async () => {
  if (isShuttingDown) return;
  try {
    const claimed = await claimNextAvailableJob(getDb(), WORKER_ID, LEASE_DURATION_MS);
    if (claimed) {
      console.log(`[appbuilder-worker] stale-lease sweep claimed job ${claimed.id} (status: ${claimed.status})`);
      await processClaimedJob(claimed);
    }
  } catch (err) {
    console.error("[appbuilder-worker] stale-lease sweep error:", err);
  }
}, SWEEP_INTERVAL_MS);

const healthServer = createServer(async (_req, res) => {
  const checks = { worker: !isShuttingDown, redis: false, database: false };
  try {
    checks.redis = (await redis.ping()) === "PONG";
  } catch {
    // leave false
  }
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    checks.database = true;
  } catch {
    // leave false
  }
  const ok = checks.worker && checks.redis && checks.database;
  res.writeHead(ok ? 200 : 503, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      ok,
      service: "appbuilder-worker",
      queue: GENERATION_QUEUE_NAME,
      concurrency: CONCURRENCY,
      activeJobCount,
      checks,
      timestamp: new Date().toISOString(),
    }),
  );
});
healthServer.listen(HEALTH_PORT, "0.0.0.0", () => {
  const config = loadAiProviderConfig();
  console.log(`[appbuilder-worker] ${WORKER_ID} listening; health on :${HEALTH_PORT}`, safeConfigSummary(config));
});

function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[appbuilder-worker] ${signal} received, shutting down gracefully...`);
  clearInterval(sweepInterval);
  Promise.all([
    worker.close(),
    redis.quit(),
    closeDb(),
    new Promise<void>((resolve, reject) => {
      healthServer.close((err) => (err ? reject(err) : resolve()));
    }),
  ])
    .catch((err) => console.error("[appbuilder-worker] error during shutdown:", err))
    .finally(() => process.exit(0));
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
