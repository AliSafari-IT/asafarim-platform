import "server-only";
import { getJobmatchDb } from "../db/client";
import { evaluateEligibility } from "../eligibility/evaluate";
import { getConfirmedVersion } from "../profile/versions";
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
 *
 * `RULE_WRONGLY_EXCLUDED` feedback is re-validated here, not only against
 * the *global* set of eligibility reason codes (the contract schema's job)
 * but against what `evaluateEligibility` actually produces for *this*
 * candidate's confirmed profile and *this* posting right now. Without that,
 * an authenticated caller could attach any real-looking reason code to any
 * posting regardless of whether it ever fired, and triage would be reading
 * fiction. Re-evaluating against *current* state (rather than the exact
 * profile version and posting content hash the candidate actually saw) is
 * a known simplification: a profile edited between viewing and reporting
 * could shift what fires. That is judged acceptable for a candidate-honesty
 * check — the report is about a rule, not a forensic replay — but a future
 * version of this could carry the profile version id and posting content
 * hash forward the way M4's EligibilityResult already does internally.
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
  | { ok: false; reasonCode: "POSTING_NOT_FOUND" | "RELATED_REASON_NOT_APPLICABLE" };

export async function submitFeedback(
  workspaceId: string,
  input: FeedbackSubmission,
): Promise<SubmitFeedbackResult> {
  const db = getJobmatchDb();

  const posting = await db.jobPosting.findUnique({
    where: { id: input.jobPostingId },
    select: {
      employer: true,
      locationRaw: true,
      isRemote: true,
      contractType: true,
      salaryMin: true,
      salaryMax: true,
      salaryCurrency: true,
      salaryPeriod: true,
      requiresSponsorship: true,
      languageRequired: true,
      requiredCertifications: true,
    },
  });
  if (!posting) return { ok: false, reasonCode: "POSTING_NOT_FOUND" };

  if (input.reasonCode === "RULE_WRONGLY_EXCLUDED") {
    const confirmed = await getConfirmedVersion(workspaceId);
    const fired = confirmed
      ? evaluateEligibility(confirmed.content, posting).reasons.map((reason) => reason.code)
      : [];
    if (!fired.includes(input.relatedEligibilityReasonCode as (typeof fired)[number])) {
      return { ok: false, reasonCode: "RELATED_REASON_NOT_APPLICABLE" };
    }
  }

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
