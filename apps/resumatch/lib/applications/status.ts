import type { ApplicationStatusName } from "./constants";

/**
 * Status rules shared by the manual stepper and the email send
 * (send-application.md). `Application.status` is the single source of truth
 * for "Applied"; `appliedAt` only records when it first became true.
 */

/** What an accepted application email does to the status: a Saved
 *  application becomes Applied; every later stage (and Rejected) stays
 *  exactly where it is, so a follow-up never moves an application back. */
export function statusAfterAcceptedEmail(current: ApplicationStatusName): ApplicationStatusName {
  return current === "SAVED" ? "APPLIED" : current;
}

/** The `statusTransition` recorded on a sent email. */
export function describeTransition(before: ApplicationStatusName, after: ApplicationStatusName): string {
  return before === after ? `${before} (unchanged)` : `${before}->${after}`;
}

/**
 * `appliedAt` after a status change: set when an application first becomes
 * Applied (by hand or by email), cleared when the candidate moves it back
 * to Saved (they say they have not applied), otherwise left alone.
 * `undefined` means "don't write the column".
 */
export function appliedAtForStatusChange(
  before: ApplicationStatusName,
  after: ApplicationStatusName,
  currentAppliedAt: Date | null,
  now: Date,
): Date | null | undefined {
  if (before === after) return undefined;
  if (after === "SAVED") return currentAppliedAt === null ? undefined : null;
  if (after === "APPLIED" && currentAppliedAt === null) return now;
  return undefined;
}
