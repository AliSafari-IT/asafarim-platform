/**
 * Shared BullMQ queue instance for AppBuilder generation-job dispatch.
 * Imported both by Next.js server code (to nudge the worker after
 * enqueue/clarification-resume) and by the standalone worker process
 * (worker.ts) to consume dispatch messages. Mirrors apps/vionto's
 * lib/server/queue.ts.
 *
 * This is a low-latency WAKE-UP signal only — the durable source of truth
 * for job state, idempotency, and crash recovery is entirely
 * `generation_jobs` in Postgres (lib/repositories/generationJobs.ts). If a
 * dispatch message is lost (e.g. a Redis restart without persistence), the
 * worker's periodic stale-lease sweep (claimNextAvailableJob) still finds
 * and processes the job — Redis/BullMQ availability is never a correctness
 * dependency, only a latency optimization.
 *
 * The connection is created lazily so importing this module during
 * `next build` (page-data collection) never throws when REDIS_URL is absent.
 */
import { Queue } from "bullmq";
import Redis from "ioredis";

export const GENERATION_QUEUE_NAME = "appbuilder-generation";

export interface GenerationDispatchMessage {
  jobId: string;
}

let _redis: Redis | undefined;
let _queue: Queue<GenerationDispatchMessage> | undefined;

function getRedis(): Redis {
  if (!_redis) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error(
        "REDIS_URL environment variable is required for AppBuilder generation dispatch. " +
          "Set it to redis://localhost:6390 (dev) or your Redis instance URL.",
      );
    }
    _redis = new Redis(url, { maxRetriesPerRequest: null });
  }
  return _redis;
}

export function getGenerationQueue(): Queue<GenerationDispatchMessage> {
  if (!_queue) {
    _queue = new Queue<GenerationDispatchMessage>(GENERATION_QUEUE_NAME, { connection: getRedis() });
  }
  return _queue;
}

/**
 * Nudges the worker to process (or resume) a job. Uses a deterministic
 * BullMQ jobId (`dispatch:{jobId}:{cause}[:{attempt}]`) so a burst of
 * redundant nudges for the same underlying generation job and cause (e.g.
 * enqueue immediately followed by a UI-triggered status refresh) collapses
 * to at most one queued BullMQ message rather than piling up duplicates —
 * BullMQ's `add` with an already-queued jobId is a no-op. `attempt` (the
 * job's `attemptCount` after a retryable failure) keeps each backoff retry
 * distinctly addressable while still being fully deterministic, so a
 * duplicate retry-scheduling call (e.g. two workers racing on the same
 * failed job) also collapses rather than double-scheduling.
 */
export async function nudgeWorker(
  jobId: string,
  options: { cause?: "enqueue" | "resume" | "retry"; attempt?: number; delayMs?: number } = {},
): Promise<void> {
  const cause = options.cause ?? "enqueue";
  const suffix = cause === "retry" ? `${cause}-${options.attempt ?? 0}` : cause;
  // BullMQ rejects custom job ids containing ":" (reserved as its own Redis
  // key delimiter) — "-" keeps this deterministic and dedupe-safe without
  // tripping Job.validateOptions.
  await getGenerationQueue().add(
    GENERATION_QUEUE_NAME,
    { jobId },
    { jobId: `dispatch-${jobId}-${suffix}`, delay: options.delayMs, removeOnComplete: true, removeOnFail: 1000 },
  );
}

export async function closeQueue(): Promise<void> {
  if (_queue) {
    await _queue.close();
    _queue = undefined;
  }
  if (_redis) {
    _redis.disconnect();
    _redis = undefined;
  }
}
