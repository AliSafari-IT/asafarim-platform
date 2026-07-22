/**
 * M07-level cost/rate protection. Full quota management is M12 — these are
 * the minimum guardrails this milestone requires so a single user or a
 * runaway loop cannot generate unbounded provider spend or worker load.
 * Kept as plain constants (not env-configurable) except where noted, since
 * they are safety ceilings rather than per-deployment tuning knobs — see
 * @asafarim/appbuilder-ai's PLANNING_LIMITS/AiProviderConfig for the knobs
 * that ARE meant to be tuned per deployment.
 */
export const GENERATION_LIMITS = {
  /** Non-terminal generation jobs a single app may have at once. */
  MAX_ACTIVE_JOBS_PER_APP: 1,
  /** Non-terminal generation jobs a single initiating user may have across all apps at once. */
  MAX_ACTIVE_JOBS_PER_USER: 3,
  /** How long a worker's claim on a job is valid before another worker may reclaim it. */
  DEFAULT_LEASE_DURATION_MS: 120_000,
  /** How often a worker must refresh its lease while actively processing a job. */
  HEARTBEAT_INTERVAL_MS: 30_000,
  /** How often the stale-lease sweep looks for orphaned/expired-lease jobs to reclaim. */
  STALE_LEASE_SWEEP_INTERVAL_MS: 60_000,
  /** Retries for a single job before it fails permanently, on top of @asafarim/appbuilder-ai's per-call provider retries. */
  MAX_JOB_ATTEMPTS: 3,
} as const;
