import "server-only";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { logError } from "../../observability/logger";
import { JOB, QUEUE, type EmbeddingComputeJobData } from "../../../worker/queues";

/**
 * Producer side of JM-041's embedding.compute job (issue #246's queue
 * substrate). Kept separate from ../../../worker/index.ts, which is the
 * consumer: the Next.js request path (a profile confirm, a posting ingest)
 * enqueues here, and the standalone worker process picks the job up.
 *
 * Embedding (re)computation is explicitly async, never synchronous in the
 * request path — see the issue: a candidate confirming their profile must
 * not wait on an embed() call, and a Redis or provider outage must never
 * turn into a failed confirm. Every failure here is caught and logged, not
 * thrown.
 */

let queue: Queue<EmbeddingComputeJobData> | undefined;

function getQueue(): Queue<EmbeddingComputeJobData> | null {
  const redisUrl = process.env.REDIS_URL;
  // No REDIS_URL (local dev without `pnpm db:up`, or a unit test process) is
  // not an error: embedding compute is simply skipped, the same way the
  // worker itself refuses to boot without REDIS_URL rather than degrading —
  // except here the caller (a request handler) must keep working regardless.
  if (!redisUrl) return null;

  if (!queue) {
    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    connection.on("error", (err) => logError("embedding_queue.redis_error", err));
    queue = new Queue<EmbeddingComputeJobData>(QUEUE.embedding, { connection });
  }
  return queue;
}

/**
 * Enqueue asynchronous embedding (re)computation. Fire-and-forget: never
 * throws, so a caller can `void enqueueEmbeddingCompute(...)` without a
 * try/catch of its own.
 */
export async function enqueueEmbeddingCompute(data: EmbeddingComputeJobData): Promise<void> {
  try {
    const q = getQueue();
    if (!q) return;
    await q.add(JOB.embeddingCompute, data, { removeOnComplete: 50, removeOnFail: 50 });
  } catch (error) {
    logError("embedding_queue.enqueue_failed", error, { kind: data.kind });
  }
}
