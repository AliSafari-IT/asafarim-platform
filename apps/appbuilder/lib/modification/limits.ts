/**
 * M08 cost/rate/safety guardrails for conversational modification —
 * mirrors lib/generation/limits.ts's role for M07, sized smaller since a
 * modification job is one bounded follow-up request, never a multi-
 * iteration build-out.
 */
export const MODIFICATION_LIMITS = {
  /** Non-terminal modification jobs a single app may have at once. */
  MAX_ACTIVE_JOBS_PER_APP: 1,
  /** Non-terminal modification jobs a single initiating user may have across all apps at once. */
  MAX_ACTIVE_JOBS_PER_USER: 3,
  /** How long a worker's claim on a job is valid before another worker may reclaim it. */
  DEFAULT_LEASE_DURATION_MS: 120_000,
  /** How often the stale-lease sweep looks for orphaned/expired-lease jobs to reclaim. */
  STALE_LEASE_SWEEP_INTERVAL_MS: 60_000,
  /** Retries for a single job before it fails permanently. */
  MAX_JOB_ATTEMPTS: 3,
  /** A single modification proposal may never touch more operations than this — conversational edits are bounded, local changes, not app builds. */
  MAX_OPERATIONS_PER_PROPOSAL: 12,
  /** Maximum characters of a user's free-text request persisted/sent to the provider. */
  MAX_REQUEST_LENGTH: 4_000,
  /** How long an unconfirmed destructive proposal stays valid before the confirmation token expires. */
  CONFIRMATION_TTL_MS: 15 * 60_000,
} as const;
