import { z } from "zod";
import type { ExclusionReasonCode } from "../eligibility/evaluate";

/**
 * Kept in sync with evaluate.ts's ExclusionReasonCode by construction, not
 * by remembering to update a second list: this object must have exactly
 * one key per code in that union, so adding or renaming a code there
 * without updating this file is a compile error here, not a validation gap
 * discovered later when a candidate's feedback silently fails to parse.
 */
const EXCLUSION_REASON_CODE_SET: Record<ExclusionReasonCode, true> = {
  REQUIRES_SPONSORSHIP_NOT_OFFERED: true,
  LANGUAGE_NOT_MET: true,
  CERTIFICATION_NOT_MET: true,
  REMOTE_ONLY_PREFERENCE: true,
  LOCATION_NOT_MATCHED: true,
  BELOW_SALARY_FLOOR: true,
  CONTRACT_TYPE_NOT_WANTED: true,
};
const EXCLUSION_REASON_CODES = Object.keys(EXCLUSION_REASON_CODE_SET) as ExclusionReasonCode[];

/**
 * Relevance feedback and correction reporting (JM-059).
 *
 * A candidate can say a match is wrong, but "wrong" is not one thing — the
 * profile could have read something incorrectly, the posting could be
 * stale or misdescribed at the source, or an M4 eligibility rule could have
 * excluded (or included) a job it shouldn't have. `FeedbackReasonCode`
 * carries that distinction as data rather than as a free-text complaint, so
 * feedback can be routed to whoever actually owns the fix — the same
 * reason-code-over-message discipline M4's eligibility engine holds (see
 * lib/eligibility/evaluate.ts): the UI owns the label, the code owns the
 * meaning, and the two cannot drift apart.
 *
 * `feedbackTargetOf` is the routing table: every reason code maps to
 * exactly one target area, so a future dashboard can group open feedback
 * by what actually needs fixing without re-deriving that mapping ad hoc.
 */

export const FEEDBACK_REASON_CODES = [
  /** The profile is missing a skill, language, or fact the candidate
   *  actually has — extraction or a manual edit fell short. */
  "PROFILE_SKILL_MISSING",
  /** Something else on the profile is wrong: a location, work
   *  authorisation, or salary preference that doesn't reflect them. */
  "PROFILE_DATA_INCORRECT",
  /** The posting looks filled, withdrawn, or otherwise no longer live,
   *  despite still showing as ACTIVE. */
  "SOURCE_POSTING_STALE",
  /** The posting's title, salary, location, or requirements as shown don't
   *  match what the source actually says. */
  "SOURCE_DETAILS_INCORRECT",
  /** An M4 eligibility rule excluded this job for a reason the candidate
   *  disputes — pair with `relatedEligibilityReasonCode`. */
  "RULE_WRONGLY_EXCLUDED",
  /** The job was shown as eligible but the candidate believes a rule
   *  should have excluded it. */
  "RULE_WRONGLY_INCLUDED",
  /** Nothing above fits — the job just isn't relevant to this candidate,
   *  for reasons no rule or field captures. */
  "NOT_RELEVANT",
  /** A specific `MatchEvidence` row in JM-048's evidence-linked explanation
   *  panel misreads the candidate's profile, misstates the posting
   *  requirement, or draws a connection between them that doesn't hold —
   *  pair with `relatedProfileField` / `relatedPostingRequirement` so the
   *  report is traceable to the exact row, not just the posting. */
  "INCORRECT_MATCH_EVIDENCE",
  "OTHER",
] as const;

export const feedbackReasonCodeSchema = z.enum(FEEDBACK_REASON_CODES);
export type FeedbackReasonCode = (typeof FEEDBACK_REASON_CODES)[number];

export type FeedbackTarget = "profile" | "source" | "rule" | "match" | "other";

/** Which area owns a fix for each reason code — the routing table feedback
 *  exists to produce (JM-059: "connect feedback to profile, source, rule,
 *  or model improvements"). `INCORRECT_MATCH_EVIDENCE` (JM-048) is the
 *  first reason code that maps to "match": it disputes a specific
 *  `MatchEvidence` row from M5's live evaluation, not the profile, the
 *  source posting, or an M4 eligibility rule. */
export const FEEDBACK_TARGET: Record<FeedbackReasonCode, FeedbackTarget> = {
  PROFILE_SKILL_MISSING: "profile",
  PROFILE_DATA_INCORRECT: "profile",
  SOURCE_POSTING_STALE: "source",
  SOURCE_DETAILS_INCORRECT: "source",
  RULE_WRONGLY_EXCLUDED: "rule",
  RULE_WRONGLY_INCLUDED: "rule",
  NOT_RELEVANT: "other",
  INCORRECT_MATCH_EVIDENCE: "match",
  OTHER: "other",
};

export function feedbackTargetOf(reasonCode: FeedbackReasonCode): FeedbackTarget {
  return FEEDBACK_TARGET[reasonCode];
}

export const feedbackSubmissionSchema = z
  .object({
    jobPostingId: z.string().trim().min(1).max(64),
    reasonCode: feedbackReasonCodeSchema,
    note: z.string().trim().min(1).max(2000).nullable().optional(),
    /** The specific M4 ExclusionReasonCode this feedback disputes, e.g.
     *  "LOCATION_NOT_MATCHED". Validated against the same closed set
     *  evaluate.ts produces — never accepted as an arbitrary string —
     *  and required exactly when `reasonCode` is RULE_WRONGLY_EXCLUDED,
     *  since that is the only case where a specific fired rule exists to
     *  name. */
    relatedEligibilityReasonCode: z.string().trim().min(1).max(64).nullable().optional(),
    /** Which confirmed profile version the disputed `MatchEvidence` row was
     *  resolved against — required exactly when `reasonCode` is
     *  `INCORRECT_MATCH_EVIDENCE`, so the report stays traceable to the
     *  fact the candidate actually saw even if they edit their profile
     *  afterwards. */
    relatedProfileVersionId: z.string().trim().min(1).max(64).nullable().optional(),
    /** The `MatchEvidence.profileField` reference the report is about. */
    relatedProfileField: z.string().trim().min(1).max(120).nullable().optional(),
    /** The `MatchEvidence.postingRequirement` the report is about. */
    relatedPostingRequirement: z.string().trim().min(1).max(400).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.reasonCode === "RULE_WRONGLY_EXCLUDED") {
      if (
        !value.relatedEligibilityReasonCode ||
        !EXCLUSION_REASON_CODES.includes(value.relatedEligibilityReasonCode as ExclusionReasonCode)
      ) {
        ctx.addIssue({
          code: "custom",
          message: "RULE_WRONGLY_EXCLUDED feedback must name which eligibility rule fired.",
          path: ["relatedEligibilityReasonCode"],
        });
      }
    } else if (value.relatedEligibilityReasonCode !== undefined) {
      // Checked for "not undefined" rather than truthiness: an explicit
      // `null` is still a caller stating something about this field for a
      // reason code where it means nothing, and the truthy check used to
      // let that through silently.
      ctx.addIssue({
        code: "custom",
        message: "relatedEligibilityReasonCode is only meaningful for RULE_WRONGLY_EXCLUDED feedback.",
        path: ["relatedEligibilityReasonCode"],
      });
    }

    if (value.reasonCode === "INCORRECT_MATCH_EVIDENCE") {
      if (!value.relatedProfileField || !value.relatedPostingRequirement) {
        ctx.addIssue({
          code: "custom",
          message:
            "INCORRECT_MATCH_EVIDENCE feedback must name the disputed evidence row (relatedProfileField and relatedPostingRequirement).",
          path: ["relatedProfileField"],
        });
      }
    } else if (
      value.relatedProfileField !== undefined ||
      value.relatedPostingRequirement !== undefined ||
      value.relatedProfileVersionId !== undefined
    ) {
      ctx.addIssue({
        code: "custom",
        message: "The match-evidence fields are only meaningful for INCORRECT_MATCH_EVIDENCE feedback.",
        path: ["relatedProfileField"],
      });
    }
  });

export type FeedbackSubmission = z.infer<typeof feedbackSubmissionSchema>;
