import { describe, expect, it } from "vitest";
import {
  BRIEF_SHARING_ESSENTIALS,
  briefBlockersForSharing,
  computeBriefCompleteness,
  estimateSessions,
  isBriefReadyForReview,
  missingBriefFields,
  nextBriefQuestion,
  resolveBriefLanguage,
  type BriefFields,
} from "../learning-brief";

const FULL: BriefFields = {
  subject: "Mathematics",
  topic: "Quadratic equations",
  educationalLevel: "K12",
  currentUnderstanding: "I know the formula but can't apply it",
  learningObjective: "Pass the exam in two weeks",
  mode: "ONLINE",
  language: "nl",
  availability: [{ day: "MON", from: "16:00", to: "18:00" }],
};

describe("missing fields and the interview script", () => {
  it("asks for the subject first when nothing is known", () => {
    const question = nextBriefQuestion({});
    expect(question?.field).toBe("subject");
  });

  it("walks the script in order as fields fill in", () => {
    expect(nextBriefQuestion({ subject: "Mathematics" })?.field).toBe("topic");
    expect(
      nextBriefQuestion({ subject: "Mathematics", topic: "Quadratics" })?.field,
    ).toBe("educationalLevel");
  });

  it("skips location entirely for an online-only student", () => {
    const online = missingBriefFields({ mode: "ONLINE" }).map((r) => r.field);
    expect(online).not.toContain("locationCity");

    const inPerson = missingBriefFields({ mode: "IN_PERSON" }).map((r) => r.field);
    expect(inPerson).toContain("locationCity");
  });

  it("does not re-ask a field the student already declined to answer", () => {
    const fields: BriefFields = { subject: "Mathematics" };
    // We asked about the topic; they answered something else entirely.
    const next = nextBriefQuestion(fields, ["topic"]);
    expect(next?.field).toBe("educationalLevel");
  });

  it("treats an empty string as unanswered", () => {
    expect(nextBriefQuestion({ subject: "   " })?.field).toBe("subject");
  });

  it("is ready for review once every applicable field is filled", () => {
    expect(isBriefReadyForReview(FULL)).toBe(true);
  });

  it("is also ready once every remaining field has been asked about once", () => {
    const partial: BriefFields = { subject: "Mathematics", topic: "Quadratics" };
    const asked = missingBriefFields(partial).map((r) => r.field);
    expect(isBriefReadyForReview(partial, asked)).toBe(true);
  });
});

describe("completeness is derived from the student's answers", () => {
  it("is 0 for an empty brief and 1 for a complete one", () => {
    expect(computeBriefCompleteness({})).toBe(0);
    expect(computeBriefCompleteness(FULL)).toBe(1);
  });

  it("rises monotonically as fields are answered", () => {
    const a = computeBriefCompleteness({ subject: "Mathematics" });
    const b = computeBriefCompleteness({
      subject: "Mathematics",
      topic: "Quadratics",
    });
    expect(b).toBeGreaterThan(a);
  });

  it("does not count a field the student never gave, however confident the AI sounded", () => {
    // The scoring function only sees fields; there is no confidence input it
    // could be talked into by a model. This is the guarantee under
    // "never pretend to understand the student's level".
    const withoutLevel = { ...FULL, educationalLevel: undefined };
    expect(computeBriefCompleteness(withoutLevel)).toBeLessThan(1);
  });

  it("ignores inapplicable fields when weighting", () => {
    // An online student is not penalised for having no city.
    const online: BriefFields = { ...FULL, mode: "ONLINE" };
    expect(computeBriefCompleteness(online)).toBe(1);
  });
});

describe("sharing essentials", () => {
  it("blocks a brief that is missing anything a tutor needs", () => {
    expect(briefBlockersForSharing({})).toEqual(BRIEF_SHARING_ESSENTIALS);
  });

  it("lets a brief through once the four essentials are present", () => {
    expect(briefBlockersForSharing(FULL)).toEqual([]);
  });

  it("blocks on a missing objective even when everything else is set", () => {
    expect(briefBlockersForSharing({ ...FULL, learningObjective: undefined })).toEqual([
      "learningObjective",
    ]);
  });
});

describe("language resolution", () => {
  it("prefers what the student said over their profile and locale", () => {
    expect(
      resolveBriefLanguage({ stated: "fr", profilePreferred: "nl", localeHint: "en" }),
    ).toBe("fr");
  });

  it("falls back to the profile, then the app locale, then English", () => {
    expect(resolveBriefLanguage({ profilePreferred: "nl", localeHint: "en" })).toBe("nl");
    expect(resolveBriefLanguage({ localeHint: "de-DE" })).toBe("de");
    expect(resolveBriefLanguage({})).toBe("en");
  });
});

describe("session estimate", () => {
  it("proposes a shorter block for younger students", () => {
    expect(estimateSessions({ educationalLevel: "K12" }).minutes).toBe(60);
    expect(estimateSessions({ educationalLevel: "UNDERGRAD" }).minutes).toBe(90);
  });

  it("adds sessions for prerequisite gaps", () => {
    const base = estimateSessions({ difficulties: ["a", "b", "c"] }).sessions;
    const withGaps = estimateSessions({
      difficulties: ["a", "b", "c"],
      prerequisiteGaps: ["factorising", "fractions"],
    }).sessions;
    expect(withGaps).toBeGreaterThan(base);
  });

  it("compresses rather than extends the plan when a deadline is close", () => {
    const soon = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000);
    const estimate = estimateSessions({
      difficulties: ["a", "b", "c"],
      prerequisiteGaps: ["x", "y", "z"],
      deadlineAt: soon,
    });
    expect(estimate.sessions).toBeLessThanOrEqual(3);
    expect(estimate.rationale).toContain("deadline");
  });

  it("never proposes zero sessions", () => {
    expect(estimateSessions({}).sessions).toBeGreaterThanOrEqual(1);
  });
});
