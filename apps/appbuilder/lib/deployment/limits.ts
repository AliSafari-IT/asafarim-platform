/**
 * M11 durable-worker guardrails for the deployment pipeline — mirrors
 * lib/validation/limits.ts's VALIDATION_LIMITS role for M10.
 */
export const DEPLOYMENT_LIMITS = {
  /** How long a worker's claim on a deployment is valid before another worker may reclaim it. Generous — the pipeline includes an artifact-preparation phase and an external verification round-trip. */
  DEFAULT_LEASE_DURATION_MS: 180_000,
  /** How often the stale-lease sweep looks for orphaned/expired-lease deployments to reclaim. */
  STALE_LEASE_SWEEP_INTERVAL_MS: 60_000,
  /** Retries for a single deployment attempt before it fails permanently (infrastructure-classified failures only — an ineligible release or a genuine health/smoke failure is never retried automatically). */
  MAX_DEPLOYMENT_ATTEMPTS: 3,
  /** Wall-clock budget for the in-process health/smoke checks before they are treated as a failure. */
  HEALTH_CHECK_TIMEOUT_MS: 15_000,
  /** Wall-clock budget for the post-activation external verification HTTP round-trip. */
  EXTERNAL_VERIFY_TIMEOUT_MS: 10_000,
} as const;
