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
 * (see lib/workspace.ts). Every write is also idempotent by construction:
 * `upsert` plus `checkTransition`'s no-op handling means a retried request
 * changes nothing extra and never errors.
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

  const posting = await db.jobPosting.findUnique({
    where: { id: input.jobPostingId },
    select: { id: true },
  });
  if (!posting) return { ok: false, reasonCode: "POSTING_NOT_FOUND" };

  const existing = await db.trackedJob.findUnique({
    where: { workspaceId_jobPostingId: { workspaceId: input.workspaceId, jobPostingId: input.jobPostingId } },
  });

  const transition = checkTransition(existing?.status ?? null, input.status);
  if (!transition.allowed) return { ok: false, reasonCode: "INVALID_TRANSITION" };

  // Recording appliedAt is a fact about a real-world event, not a value a
  // later "undo and reapply" should be able to overwrite — the first time
  // a job reaches APPLIED is when it happened, full stop.
  const appliedAt =
    input.status === "APPLIED" ? (existing?.appliedAt ?? new Date()) : (existing?.appliedAt ?? null);

  const record = await db.trackedJob.upsert({
    where: { workspaceId_jobPostingId: { workspaceId: input.workspaceId, jobPostingId: input.jobPostingId } },
    create: {
      workspaceId: input.workspaceId,
      jobPostingId: input.jobPostingId,
      status: input.status,
      notes: input.notes ?? null,
      appliedAt,
      interviewAt: input.interviewAt ?? null,
      followUpAt: input.followUpAt ?? null,
    },
    update: {
      status: input.status,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.interviewAt !== undefined ? { interviewAt: input.interviewAt } : {}),
      ...(input.followUpAt !== undefined ? { followUpAt: input.followUpAt } : {}),
      appliedAt,
    },
  });

  if (!transition.isNoop || existing === null) {
    await recordAuditEvent(input.workspaceId, "tracking.status.changed", {
      outcome: input.status,
    });
  }

  return { ok: true, record };
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
