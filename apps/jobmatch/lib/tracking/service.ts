import "server-only";
import { getJobmatchDb } from "../db/client";
import { recordAuditEvent } from "../workspace";
import { checkTransition, type TrackedJobStatus } from "./state";

/**
 * Saved-job and application records (JM-050).
 *
 * Every write here is scoped to the caller's own workspace — never to an id
 * a client supplied for tracking directly — so cross-user access is
 * structurally unavailable the same way the rest of the app enforces it
 * (see lib/workspace.ts).
 *
 * `setTrackedJobStatus` validates and writes as one optimistic-concurrency
 * loop rather than a plain read-then-write: two concurrent requests (a
 * REJECTED and an APPLIED racing each other) could otherwise both read the
 * same prior status, both pass `checkTransition`, and the loser's write
 * would silently erase a terminal APPLIED and its `appliedAt`. Every write
 * is conditioned on the status actually still being what was just read —
 * if it changed underneath, the loop re-reads and re-validates against the
 * new status rather than overwriting it. A pure retry of an unchanged
 * request (same status, no new notes or dates) is detected and skipped
 * entirely, so it changes nothing — not even `updatedAt`.
 */

export interface TrackedJobRecord {
  id: string;
  jobPostingId: string;
  status: TrackedJobStatus;
  notes: string | null;
  appliedAt: Date | null;
  interviewAt: Date | null;
  followUpAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type SetTrackedJobStatusResult =
  | { ok: true; record: TrackedJobRecord }
  | { ok: false; reasonCode: "POSTING_NOT_FOUND" | "INVALID_TRANSITION" };

export interface SetTrackedJobStatusInput {
  workspaceId: string;
  jobPostingId: string;
  status: TrackedJobStatus;
  /** Undefined leaves the stored value unchanged; null clears it. Distinct
   *  from a field the caller did not mention at all, which is what lets a
   *  status-only update leave existing notes alone. */
  notes?: string | null;
  interviewAt?: Date | null;
  followUpAt?: Date | null;
}

/**
 * Create or transition one workspace's tracking record for one posting.
 *
 * Ownership is enforced by scoping every read and write to `workspaceId`
 * from the session, never from a value the client supplied — the same
 * pattern lib/profile/versions.ts uses for profile versions.
 */
export async function setTrackedJobStatus(
  input: SetTrackedJobStatusInput,
): Promise<SetTrackedJobStatusResult> {
  const db = getJobmatchDb();
  const where = { workspaceId_jobPostingId: { workspaceId: input.workspaceId, jobPostingId: input.jobPostingId } };

  const posting = await db.jobPosting.findUnique({
    where: { id: input.jobPostingId },
    select: { id: true },
  });
  if (!posting) return { ok: false, reasonCode: "POSTING_NOT_FOUND" };

  const hasAuxiliaryChange =
    input.notes !== undefined || input.interviewAt !== undefined || input.followUpAt !== undefined;

  // Bounded retry against concurrent writers to the same row — see the
  // module doc comment. Contention here means two clicks on the same job
  // in the same instant, which is rare, so a small bound costs nothing.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await db.trackedJob.findUnique({ where });

    const transition = checkTransition(existing?.status ?? null, input.status);
    if (!transition.allowed) return { ok: false, reasonCode: "INVALID_TRANSITION" };

    // A pure retry of an already-applied request changes nothing at all —
    // not even updatedAt — so a duplicated click or a flaky retry cannot
    // reorder the tracker or manufacture an audit event.
    if (transition.isNoop && existing !== null && !hasAuxiliaryChange) {
      return { ok: true, record: existing };
    }

    // Recording appliedAt is a fact about a real-world event, not a value a
    // later "undo and reapply" should be able to overwrite — the first
    // time a job reaches APPLIED is when it happened, full stop.
    const appliedAt =
      input.status === "APPLIED" ? (existing?.appliedAt ?? new Date()) : (existing?.appliedAt ?? null);

    if (existing === null) {
      try {
        const record = await db.trackedJob.create({
          data: {
            workspaceId: input.workspaceId,
            jobPostingId: input.jobPostingId,
            status: input.status,
            notes: input.notes ?? null,
            appliedAt,
            interviewAt: input.interviewAt ?? null,
            followUpAt: input.followUpAt ?? null,
          },
        });
        await recordAuditEvent(input.workspaceId, "tracking.status.changed", { outcome: input.status });
        return { ok: true, record };
      } catch (error) {
        // Another request created the row first — re-read and re-validate
        // against what actually landed, rather than assuming this write
        // still applies.
        if (isUniqueViolation(error)) continue;
        throw error;
      }
    }

    // Conditioned on the status this loop iteration actually read: if it
    // changed underneath (a concurrent writer won the race), `count` is 0
    // and the loop re-reads the new status instead of overwriting it.
    const result = await db.trackedJob.updateMany({
      where: { workspaceId: input.workspaceId, jobPostingId: input.jobPostingId, status: existing.status },
      data: {
        status: input.status,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.interviewAt !== undefined ? { interviewAt: input.interviewAt } : {}),
        ...(input.followUpAt !== undefined ? { followUpAt: input.followUpAt } : {}),
        appliedAt,
      },
    });
    if (result.count === 0) continue;

    const record = await db.trackedJob.findUniqueOrThrow({ where });
    await recordAuditEvent(input.workspaceId, "tracking.status.changed", { outcome: input.status });
    return { ok: true, record };
  }

  return { ok: false, reasonCode: "INVALID_TRANSITION" };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/** Every tracked job in a workspace, most recently updated first. */
export async function listTrackedJobs(workspaceId: string): Promise<
  (TrackedJobRecord & {
    jobPosting: {
      title: string;
      employer: string;
      canonicalUrl: string;
      locationRaw: string | null;
    };
  })[]
> {
  const db = getJobmatchDb();
  return db.trackedJob.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    include: {
      jobPosting: { select: { title: true, employer: true, canonicalUrl: true, locationRaw: true } },
    },
  });
}

/** Remove a tracking record entirely — untracking, not rejecting. Scoped to
 *  the caller's own workspace like every other write here. */
export async function deleteTrackedJob(workspaceId: string, jobPostingId: string): Promise<boolean> {
  const db = getJobmatchDb();
  const result = await db.trackedJob.deleteMany({ where: { workspaceId, jobPostingId } });
  if (result.count > 0) {
    await recordAuditEvent(workspaceId, "tracking.deleted");
  }
  return result.count > 0;
}
