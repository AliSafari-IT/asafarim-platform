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
  /** JM-041: embedding (re)computation for a confirmed profile or a job
   *  posting. Producer: the web app, from a profile confirm or a posting
   *  ingest — see lib/matching/ai/embeddingQueue.ts. Consumer: this worker. */
  embedding: "jobmatch.embedding",
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

export const JOB = {
  healthPing: "health-ping",
  /** Trivial job type that proves the enqueue -> process -> complete loop. */
  noop: "noop",
  /** JM-041: compute (or reuse the cached) embedding for one profile or posting. */
  embeddingCompute: "embedding.compute",
} as const;

/** Payload for a JOB.embeddingCompute job on QUEUE.embedding. */
export interface EmbeddingComputeJobData {
  kind: "profile" | "posting";
  /** The real workspace id for a "profile" job. For a "posting" job this is
   *  GLOBAL_EMBEDDING_WORKSPACE_ID (lib/matching/ai/embeddingCache.ts) —
   *  kept on the payload so it is uniform across both job kinds rather than
   *  optional. */
  workspaceId: string;
  /** CandidateProfile.id for "profile", JobPosting.id for "posting". */
  sourceId: string;
}
