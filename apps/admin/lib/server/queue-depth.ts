import "server-only";
import Redis from "ioredis";

/**
 * Read-only queue-depth probe for the platform's BullMQ workers.
 *
 * Reads BullMQ's key layout directly rather than instantiating Queue
 * objects: the console must never be able to enqueue, retry, or drain
 * anyone's jobs — it only reports. A Queue instance would put those methods
 * one typo away.
 *
 * Absent Redis config is a normal state, not an error: the console runs
 * fine without it and simply reports the probe as unconfigured.
 */

export interface QueueDepth {
  app: string;
  queue: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  /**
   * True when the queue is only a wake-up signal and Postgres holds the
   * durable job state — depth there is latency, not backlog.
   */
  advisory: boolean;
}

export type QueueProbeResult =
  | { state: "not_configured" }
  | { state: "error"; message: string }
  | { state: "ok"; queues: QueueDepth[] };

/** Registered worker queues, mirroring each app's lib/server/queue.ts. */
const QUEUES: ReadonlyArray<{ app: string; queue: string; advisory: boolean }> = [
  { app: "vionto", queue: "vionto-render", advisory: false },
  { app: "appbuilder", queue: "appbuilder-generation", advisory: true },
  { app: "appbuilder", queue: "appbuilder-modification", advisory: true },
  { app: "appbuilder", queue: "appbuilder-validation", advisory: true },
  { app: "appbuilder", queue: "appbuilder-repair", advisory: true },
  { app: "appbuilder", queue: "appbuilder-deployment", advisory: true },
];

const PREFIX = "bull";

export async function getQueueDepths(): Promise<QueueProbeResult> {
  const url = process.env.REDIS_URL;
  if (!url) return { state: "not_configured" };

  // The overview must render even when Redis is down or slow, so the probe
  // is short-fused and never retried: a status board that blocks on a
  // degraded dependency is worse than one reporting it.
  const redis = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 1500,
    commandTimeout: 1500,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    enableOfflineQueue: false,
  });

  try {
    await redis.connect();

    const pipeline = redis.pipeline();
    for (const { queue } of QUEUES) {
      pipeline.llen(`${PREFIX}:${queue}:wait`);
      pipeline.llen(`${PREFIX}:${queue}:active`);
      pipeline.zcard(`${PREFIX}:${queue}:delayed`);
      pipeline.zcard(`${PREFIX}:${queue}:failed`);
    }
    const results = await pipeline.exec();
    if (!results) return { state: "error", message: "Redis returned no result." };

    const value = (index: number): number => {
      const entry = results[index];
      if (!entry) return 0;
      const [error, raw] = entry;
      if (error) return 0;
      return typeof raw === "number" ? raw : Number(raw ?? 0);
    };

    const queues: QueueDepth[] = QUEUES.map((definition, position) => {
      const base = position * 4;
      return {
        app: definition.app,
        queue: definition.queue,
        advisory: definition.advisory,
        waiting: value(base),
        active: value(base + 1),
        delayed: value(base + 2),
        failed: value(base + 3),
      };
    });

    return { state: "ok", queues };
  } catch (error) {
    return {
      state: "error",
      message: error instanceof Error ? error.message : "Redis is unreachable.",
    };
  } finally {
    redis.disconnect();
  }
}
