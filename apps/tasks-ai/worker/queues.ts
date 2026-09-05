/**
 * Queue names for the TasksAI worker. Kept in one place so the web app
 * (producer) and the worker (consumer) cannot drift.
 *
 * M01 ships only `maintenance` with a single no-op job that proves the
 * Redis connection and the job lifecycle. The outbox drainer, notification
 * fan-out, digest, search-index, and due-date sweep queues arrive from M02
 * (docs/adr/0005-event-outbox-strategy.md) onward.
 */
export const QUEUE = {
  maintenance: "tasksai.maintenance",
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

export const JOB = {
  healthPing: "health-ping",
} as const;
