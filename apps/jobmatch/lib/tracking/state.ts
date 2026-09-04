import { z } from "zod";

/**
 * Tracked-job state transitions (JM-049).
 *
 * A candidate's relationship with one posting moves through a small,
 * explicit state machine rather than an arbitrary status string a caller
 * can set to anything. The rule that matters: **every transition is
 * idempotent.** Saving an already-saved job, or marking an already-applied
 * job applied again, succeeds and changes nothing — a retried request (a
 * flaky connection, a double click) must never surface as an error or
 * silently overwrite a timestamp the candidate did not mean to reset.
 */

export const trackedJobStatusSchema = z.enum(["SAVED", "REJECTED", "APPLIED"]);
export type TrackedJobStatus = z.infer<typeof trackedJobStatusSchema>;

/**
 * Which statuses a transition *to* the key may start from. `SAVED` is the
 * entry point (a job with no tracking record yet is implicitly untracked,
 * so "save" is really "create or no-op"). `APPLIED` is intentionally
 * reachable from both `SAVED` and `REJECTED` — a candidate can change their
 * mind about a job they earlier rejected and still apply — but there is no
 * transition back out of `APPLIED`: once recorded, an application is a fact
 * about what happened, not a status to be undone by re-tracking the job.
 */
export const TRACKED_JOB_TRANSITIONS: Record<TrackedJobStatus, TrackedJobStatus[]> = {
  SAVED: ["SAVED", "REJECTED", "APPLIED"],
  REJECTED: ["REJECTED", "SAVED", "APPLIED"],
  APPLIED: ["APPLIED"],
};

export interface TransitionCheck {
  allowed: boolean;
  /** True when `from` and `to` are the same status — the caller should
   *  treat this as a successful no-op, not skip the update entirely: notes
   *  or follow-up dates on the same request must still be applied. */
  isNoop: boolean;
}

/**
 * Whether moving a tracked job from `from` to `to` is a legal transition.
 * `from` is `null` for a job with no tracking record yet, which may only
 * ever start at `SAVED`.
 */
export function checkTransition(from: TrackedJobStatus | null, to: TrackedJobStatus): TransitionCheck {
  if (from === null) {
    return { allowed: to === "SAVED", isNoop: false };
  }
  return { allowed: TRACKED_JOB_TRANSITIONS[from].includes(to), isNoop: from === to };
}
