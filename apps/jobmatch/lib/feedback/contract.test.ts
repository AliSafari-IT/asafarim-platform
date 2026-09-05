import { describe, expect, it } from "vitest";
import { feedbackSubmissionSchema, feedbackTargetOf } from "./contract";

describe("feedback routing table", () => {
  it("routes profile-related codes to profile", () => {
    expect(feedbackTargetOf("PROFILE_SKILL_MISSING")).toBe("profile");
    expect(feedbackTargetOf("PROFILE_DATA_INCORRECT")).toBe("profile");
  });

  it("routes source-related codes to source", () => {
    expect(feedbackTargetOf("SOURCE_POSTING_STALE")).toBe("source");
    expect(feedbackTargetOf("SOURCE_DETAILS_INCORRECT")).toBe("source");
  });

  it("routes rule-related codes to rule", () => {
    expect(feedbackTargetOf("RULE_WRONGLY_EXCLUDED")).toBe("rule");
    expect(feedbackTargetOf("RULE_WRONGLY_INCLUDED")).toBe("rule");
  });

  it("routes the catch-all codes to other", () => {
    expect(feedbackTargetOf("NOT_RELEVANT")).toBe("other");
    expect(feedbackTargetOf("OTHER")).toBe("other");
  });
});

describe("feedback submission validation", () => {
  it("accepts a simple NOT_RELEVANT submission with no eligibility reference", () => {
    const result = feedbackSubmissionSchema.safeParse({
      jobPostingId: "job-1",
      reasonCode: "NOT_RELEVANT",
    });
    expect(result.success).toBe(true);
  });

  it("accepts RULE_WRONGLY_EXCLUDED paired with a real eligibility reason code", () => {
    const result = feedbackSubmissionSchema.safeParse({
      jobPostingId: "job-1",
      reasonCode: "RULE_WRONGLY_EXCLUDED",
      relatedEligibilityReasonCode: "LOCATION_NOT_MATCHED",
    });
    expect(result.success).toBe(true);
  });

  it("rejects RULE_WRONGLY_EXCLUDED with no eligibility reason named", () => {
    const result = feedbackSubmissionSchema.safeParse({
      jobPostingId: "job-1",
      reasonCode: "RULE_WRONGLY_EXCLUDED",
    });
    expect(result.success).toBe(false);
  });

  it("rejects RULE_WRONGLY_EXCLUDED with a made-up reason code", () => {
    const result = feedbackSubmissionSchema.safeParse({
      jobPostingId: "job-1",
      reasonCode: "RULE_WRONGLY_EXCLUDED",
      relatedEligibilityReasonCode: "SOMETHING_MADE_UP",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an eligibility reason code attached to an unrelated feedback reason", () => {
    const result = feedbackSubmissionSchema.safeParse({
      jobPostingId: "job-1",
      reasonCode: "NOT_RELEVANT",
      relatedEligibilityReasonCode: "LOCATION_NOT_MATCHED",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an explicit null eligibility reference for an unrelated reason, not only a string", () => {
    // A truthy check on this field would let an explicit null through,
    // since null is falsy — this must be rejected the same as a string.
    const result = feedbackSubmissionSchema.safeParse({
      jobPostingId: "job-1",
      reasonCode: "NOT_RELEVANT",
      relatedEligibilityReasonCode: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unrecognised reasonCode", () => {
    const result = feedbackSubmissionSchema.safeParse({
      jobPostingId: "job-1",
      reasonCode: "IT_SMELLS_WRONG",
    });
    expect(result.success).toBe(false);
  });
});
