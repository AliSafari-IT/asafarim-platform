/**
 * Queue names for the ResuMatch worker. Kept in one place so the web app
 * (producer) and the worker (consumer) cannot drift, mirroring
 * `apps/tasks-ai/worker/queues.ts`.
 *
 * `maintenance` ships a `health-ping` job that proves the Redis connection
 * and a `noop` job that proves the job lifecycle end to end. The
 * embedding/match-evaluation queues from the old job-matching product are
 * gone with that pivot — see docs/jm-004-showcase-source-decision.md's
 * successor framing in README.md for why. A future async tailoring job
 * (queueing a CV-rewrite call instead of awaiting it inline) would add its
 * own queue here the same way.
 */
export const QUEUE = {
  maintenance: "resumatch.maintenance",
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

export const JOB = {
  healthPing: "health-ping",
  /** Trivial job type that proves the enqueue -> process -> complete loop. */
  noop: "noop",
} as const;
