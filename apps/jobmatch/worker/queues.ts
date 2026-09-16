/**
 * Queue names for the JobMatch worker (issue #246, M5 substrate). Kept in
 * one place so the web app (producer) and the worker (consumer) cannot
 * drift, mirroring `apps/tasks-ai/worker/queues.ts`.
 *
 * M5 ships `maintenance`, with a `health-ping` job that proves the Redis
 * connection and a `noop` job that proves the job lifecycle end to end.
 * `matchEvaluate` (JM-043) runs the real structured-evaluation pipeline
 * (lib/matching/ai/evaluate.ts) — see worker/index.ts's `handleMatchEvaluateJob`.
 */
export const QUEUE = {
  maintenance: "jobmatch.maintenance",
  /** JM-041: embedding (re)computation for a confirmed profile or a job
   *  posting. Producer: the web app, from a profile confirm or a posting
   *  ingest — see lib/matching/ai/embeddingQueue.ts. Consumer: this worker. */
  embedding: "jobmatch.embedding",
  /** JM-043: structured LLM evaluation of a (profile version, posting) pair.
   *  Producer: the web app (or a future ranking job). Consumer: this worker. */
  matchEvaluate: "jobmatch.match.evaluate",
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

export const JOB = {
  healthPing: "health-ping",
  /** Trivial job type that proves the enqueue -> process -> complete loop. */
  noop: "noop",
  /** JM-041: compute (or reuse the cached) embedding for one profile or posting. */
  embeddingCompute: "embedding.compute",
  /** JM-043: run the structured LLM evaluation pipeline for one
   *  (profile version, posting) pair. */
  matchEvaluate: "match.evaluate",
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

/** Payload for a JOB.matchEvaluate job on QUEUE.matchEvaluate (JM-043). */
export interface MatchEvaluateJobData {
  workspaceId: string;
  profileVersionId: string;
  postingId: string;
}
