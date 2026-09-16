/**
 * Queue names for the JobMatch worker (issue #246, M5 substrate). Kept in
 * one place so the web app (producer) and the worker (consumer) cannot
 * drift, mirroring `apps/tasks-ai/worker/queues.ts`.
 *
 * M5 ships only `maintenance`, with a `health-ping` job that proves the
 * Redis connection and a `noop` job that proves the job lifecycle end to
 * end. `match.evaluate` is registered here as a stub only — no processor is
 * attached yet. JM-043 (structured evaluation) fills it in with real
 * provider-call/retry/budget/cache logic; this issue is explicitly the
 * durable substrate only.
 */
export const QUEUE = {
  maintenance: "jobmatch.maintenance",
  /** Stub for JM-043. Do not attach a processor here until that issue lands. */
  matchEvaluate: "jobmatch.match.evaluate",
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

export const JOB = {
  healthPing: "health-ping",
  /** Trivial job type that proves the enqueue -> process -> complete loop. */
  noop: "noop",
} as const;
