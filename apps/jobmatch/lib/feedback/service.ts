import "server-only";
import { getJobmatchDb } from "../db/client";
import { recordAuditEvent } from "../workspace";
import type { FeedbackSubmission } from "./contract";

/**
 * Relevance feedback and correction reporting (JM-059).
 *
 * Append-only, and scoped to the caller's own workspace the same way every
 * other JobMatch write is — never to a workspace id the client supplies.
 * There is deliberately no update or delete here: a correction is a new
 * row, not an edit to an old one, so the history of what a candidate
 * reported (and when) survives their later profile fixes.
 */

export interface FeedbackRecord {
  id: string;
  jobPostingId: string;
  reasonCode: FeedbackSubmission["reasonCode"];
  note: string | null;
  relatedEligibilityReasonCode: string | null;
  createdAt: Date;
}

export type SubmitFeedbackResult =
  | { ok: true; record: FeedbackRecord }
  | { ok: false; reasonCode: "POSTING_NOT_FOUND" };

export async function submitFeedback(
  workspaceId: string,
  input: FeedbackSubmission,
): Promise<SubmitFeedbackResult> {
  const db = getJobmatchDb();

  const posting = await db.jobPosting.findUnique({
    where: { id: input.jobPostingId },
    select: { id: true },
  });
  if (!posting) return { ok: false, reasonCode: "POSTING_NOT_FOUND" };

  const record = await db.jobFeedback.create({
    data: {
      workspaceId,
      jobPostingId: input.jobPostingId,
      reasonCode: input.reasonCode,
      note: input.note ?? null,
      relatedEligibilityReasonCode: input.relatedEligibilityReasonCode ?? null,
    },
  });

  await recordAuditEvent(workspaceId, "feedback.submitted", { outcome: input.reasonCode });

  return { ok: true, record };
}

/** A workspace's own feedback history — used by /my-jobs to show what a
 *  candidate has already reported, so they can see it was received rather
 *  than wondering whether the form actually did anything. */
export async function listFeedbackForWorkspace(workspaceId: string): Promise<FeedbackRecord[]> {
  const db = getJobmatchDb();
  return db.jobFeedback.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
}
