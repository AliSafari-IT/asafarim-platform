/**
 * Shared BullMQ queue instance for Vionto render jobs.
 *
 * Imported by the Next.js API routes (to add jobs) and by the
 * standalone worker process (to consume jobs).  The Worker itself lives in
 * `apps/vionto/worker.ts` so it is not instantiated inside the web server.
 *
 * The connection is created lazily so that importing this module during
 * `next build` (page-data collection) does not throw when REDIS_URL is absent.
 */

import { Queue } from "bullmq";
import Redis from "ioredis";

export const QUEUE_NAME = "vionto-render";

let _redis: Redis | undefined;
let _queue: Queue | undefined;

function getRedis(): Redis {
  if (!_redis) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error(
        "REDIS_URL environment variable is required for Vionto. " +
          "Please set it to redis://localhost:6380 or your Redis instance URL."
      );
    }
    _redis = new Redis(url, { maxRetriesPerRequest: null });
  }
  return _redis;
}

export function getRenderQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, { connection: getRedis() });
  }
  return _queue;
}
