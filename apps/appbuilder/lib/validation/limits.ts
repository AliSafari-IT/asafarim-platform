/**
 * M10 cost/rate/safety guardrails for validation runs and the bounded AI
 * repair loop — mirrors lib/modification/limits.ts's role for M08, sized for
 * "run every gate once, repair a bounded number of times" rather than an
 * open-ended loop.
 */
export const VALIDATION_LIMITS = {
  /** Non-terminal validation runs a single app may have at once. */
  MAX_ACTIVE_RUNS_PER_APP: 1,
  /** How long a worker's claim on a run is valid before another worker may reclaim it. Generous — a full gate suite (incl. Playwright smoke) can run for minutes. */
  DEFAULT_LEASE_DURATION_MS: 300_000,
  /** How often the stale-lease sweep looks for orphaned/expired-lease runs to reclaim. */
  STALE_LEASE_SWEEP_INTERVAL_MS: 60_000,
  /** Retries for a single run/gate-suite execution before it fails permanently (infrastructure-classified failures only — a gate that FAILS on its merits is never retried automatically). */
  MAX_RUN_ATTEMPTS: 2,
  /** Wall-clock budget for one gate's execution before it is force-marked infrastructure_error. */
  GATE_TIMEOUT_MS: 60_000,
  /** How long an artifact (screenshot/trace/report) is retained before it is eligible for cleanup. */
  ARTIFACT_RETENTION_MS: 30 * 24 * 60 * 60_000, // 30 days
  /** Maximum bytes a single artifact may be before it is dropped in favor of a truncation note (guards against pathological trace files). */
  MAX_ARTIFACT_BYTES: 10 * 1024 * 1024, // 10MB
} as const;

/**
 * M10 repair-loop guardrails — issue requirements: "maximum repair attempts
 * per run; maximum operations per attempt; maximum total repair time/cost."
 * Deliberately smaller than MODIFICATION_LIMITS' per-proposal cap: a repair
 * answers ONE classified gate failure, never a broad app build-out.
 */
export const REPAIR_LIMITS = {
  /** Hard ceiling on repair attempts against a single validation run — enforced both here (application logic) and structurally by the (originatingRunId, attemptNumber) unique index (lib/db/schema.ts#repairAttempts). */
  MAX_REPAIR_ATTEMPTS_PER_RUN: 3,
  /** A single repair proposal may never touch more operations than this. */
  MAX_OPERATIONS_PER_ATTEMPT: 6,
  /** Retries for a single repair-attempt job execution before it fails permanently (infrastructure-classified only). */
  MAX_JOB_ATTEMPTS: 3,
  /** How long a worker's claim on a repair attempt is valid. */
  DEFAULT_LEASE_DURATION_MS: 180_000,
  STALE_LEASE_SWEEP_INTERVAL_MS: 60_000,
  /** How long an unconfirmed destructive repair proposal stays valid before the confirmation token expires — same TTL as M08's modification confirmation. */
  CONFIRMATION_TTL_MS: 15 * 60_000,
  /** Wall-clock budget for one repair attempt's classify->propose->apply->revalidate cycle before it is force-failed as `repair_budget_exhausted`. */
  MAX_ATTEMPT_WALL_TIME_MS: 10 * 60_000,
} as const;
