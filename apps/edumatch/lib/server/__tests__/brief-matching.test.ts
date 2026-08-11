import { describe, expect, it, vi } from "vitest";

vi.mock("@asafarim/db", () => ({ prisma: {}, Prisma: {} }));
vi.mock("../tutor-verification", () => ({
  unverifiedTutorsExcluded: () => true,
}));

import {
  MATCH_WEIGHTS,
  MAX_MATCHES,
  ineligibilityReason,
  isNewTutor,
  passesRatingFilter,
  scoreLanguage,
  scoreLevel,
  scoreMode,
  scoreProximity,
  scoreRating,
  scoreResponsiveness,
  scoreSchedule,
  scoreSubject,
  selectFinalists,
  type MatchContext,
  type TutorCandidate,
} from "../brief-matching";

function candidate(overrides: Partial<TutorCandidate> = {}): TutorCandidate {
  return {
    tutorId: "t1",
    name: "Sam",
    image: null,
    bio: null,
    subjectsTaught: ["Mathematics"],
    levelsTaught: ["K12"],
    languagesTaught: ["nl"],
    qualifications: [],
    teachingStyle: null,
    hourlyRateCents: 3000,
    onlineOnly: false,
    ratingAvg: 4.5,
    ratingCount: 20,
    verifiedAt: new Date(),
    clearedForMinorsAt: null,
    medianResponseMinutes: 60,
    distanceKm: 5,
    weeklyAvailability: [],
    score: 0.8,
    breakdown: {
      subject: MATCH_WEIGHTS.subject,
      level: MATCH_WEIGHTS.level,
      language: MATCH_WEIGHTS.language,
      mode: MATCH_WEIGHTS.mode,
      schedule: MATCH_WEIGHTS.schedule,
      rating: MATCH_WEIGHTS.rating,
      responsiveness: MATCH_WEIGHTS.responsiveness,
      proximity: MATCH_WEIGHTS.proximity,
    },
    reasons: [],
    rotationBoost: false,
    ...overrides,
  };
}

const ctx: MatchContext = {
  fields: { subject: "Mathematics", educationalLevel: "K12", mode: "ONLINE" },
  studentLocation: null,
  studentIsMinor: false,
};

describe("weights", () => {
  it("sum to 1 so the score reads as a percentage", () => {
    const total = Object.values(MATCH_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("has no term money could write to", () => {
    // Guards the "tutors cannot buy position" promise against a future factor
    // being added without anyone noticing what it implies.
    expect(Object.keys(MATCH_WEIGHTS).sort()).toEqual([
      "language",
      "level",
      "mode",
      "proximity",
      "rating",
      "responsiveness",
      "schedule",
      "subject",
    ]);
  });
});

describe("individual factors", () => {
  it("scores subject exact > partial > none", () => {
    expect(scoreSubject(["Mathematics"], "mathematics")).toBe(1);
    expect(scoreSubject(["Applied Mathematics"], "Mathematics")).toBe(0.6);
    expect(scoreSubject(["History"], "Mathematics")).toBe(0);
  });

  it("treats an unknown level as neutral rather than a failure", () => {
    expect(scoreLevel(["K12"], undefined)).toBe(0.5);
    expect(scoreLevel(["K12"], "K12")).toBe(1);
    expect(scoreLevel(["GRAD"], "K12")).toBe(0);
  });

  it("treats an undeclared language list as unknown, not wrong", () => {
    expect(scoreLanguage([], "nl")).toBe(0.5);
    expect(scoreLanguage(["nl", "en"], "nl")).toBe(1);
    expect(scoreLanguage(["fr"], "nl")).toBe(0);
  });

  it("lets any tutor teach online but not any tutor travel", () => {
    expect(scoreMode(true, "ONLINE")).toBe(1);
    expect(scoreMode(true, "IN_PERSON")).toBe(0);
    expect(scoreMode(false, "IN_PERSON")).toBe(1);
    expect(scoreMode(true, "EITHER")).toBe(1);
  });

  it("scores schedule as the fraction of the student's windows covered", () => {
    const student = [
      { day: "MON" as const, from: "16:00", to: "18:00" },
      { day: "WED" as const, from: "16:00", to: "18:00" },
    ];
    expect(
      scoreSchedule([{ day: "MON", from: "15:00", to: "19:00" }], student),
    ).toBe(0.5);
    expect(
      scoreSchedule(
        [
          { day: "MON", from: "17:00", to: "20:00" },
          { day: "WED", from: "16:00", to: "17:00" },
        ],
        student,
      ),
    ).toBe(1);
    // Same day, no overlap in hours.
    expect(
      scoreSchedule([{ day: "MON", from: "08:00", to: "10:00" }], student),
    ).toBe(0);
  });

  it("discounts a rating by how little evidence backs it", () => {
    const oneReview = scoreRating(5, 1);
    const manyReviews = scoreRating(5, 40);
    expect(manyReviews).toBeGreaterThan(oneReview);
    expect(scoreRating(0, 0)).toBe(0.5); // unproven, not bad
  });

  it("rewards fast replies and forgives an unknown response time", () => {
    expect(scoreResponsiveness(30)).toBe(1);
    expect(scoreResponsiveness(24 * 60)).toBe(0);
    expect(scoreResponsiveness(null)).toBe(0.5);
  });

  it("treats online (null distance) as unaffected by proximity", () => {
    expect(scoreProximity(null, 50)).toBe(1);
    expect(scoreProximity(0, 50)).toBe(1);
    expect(scoreProximity(50, 50)).toBe(0);
  });
});

describe("hard eligibility gates", () => {
  it("excludes an unverified tutor", () => {
    expect(ineligibilityReason(candidate({ verifiedAt: null }), ctx)).toBe(
      "UNVERIFIED",
    );
  });

  it("excludes a tutor not cleared to work with minors from a minor's brief", () => {
    const minorCtx = { ...ctx, studentIsMinor: true };
    expect(ineligibilityReason(candidate(), minorCtx)).toBe("SAFEGUARDING");
    expect(
      ineligibilityReason(
        candidate({ clearedForMinorsAt: new Date() }),
        minorCtx,
      ),
    ).toBeNull();
  });

  it("excludes a tutor who doesn't teach the subject at all", () => {
    const wrongSubject = candidate({
      breakdown: { ...candidate().breakdown, subject: 0 },
    });
    expect(ineligibilityReason(wrongSubject, ctx)).toBe("SUBJECT");
  });

  it("excludes an online-only tutor from an in-person brief", () => {
    const inPerson: MatchContext = {
      ...ctx,
      fields: { ...ctx.fields, mode: "IN_PERSON" },
    };
    expect(ineligibilityReason(candidate({ onlineOnly: true }), inPerson)).toBe(
      "MODE",
    );
  });

  it("excludes a tutor beyond travelling range for an in-person brief", () => {
    const inPerson: MatchContext = {
      ...ctx,
      fields: { ...ctx.fields, mode: "IN_PERSON" },
      maxDistanceKm: 20,
    };
    expect(ineligibilityReason(candidate({ distanceKm: 80 }), inPerson)).toBe(
      "OUT_OF_RANGE",
    );
  });

  it("lets a fully eligible tutor through", () => {
    expect(ineligibilityReason(candidate(), ctx)).toBeNull();
  });
});

describe("selectFinalists", () => {
  const established = (id: string, score: number) =>
    candidate({ tutorId: id, score, ratingCount: 20 });
  const newcomer = (id: string, score: number) =>
    candidate({ tutorId: id, score, ratingCount: 0 });

  it("never returns more than five", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      established(`t${i}`, 1 - i / 100),
    );
    expect(selectFinalists(many, []).length).toBe(MAX_MATCHES);
  });

  it("returns everyone when there are five or fewer", () => {
    const few = [established("a", 0.9), established("b", 0.8)];
    expect(selectFinalists(few, []).map((c) => c.tutorId)).toEqual(["a", "b"]);
  });

  it("ranks by score", () => {
    const pool = [
      established("low", 0.2),
      established("high", 0.9),
      established("mid", 0.5),
    ];
    expect(selectFinalists(pool, []).map((c) => c.tutorId)).toEqual([
      "high",
      "mid",
      "low",
    ]);
  });

  it("reserves the last slot for a newcomer when the top four are established", () => {
    const pool = [
      established("a", 0.95),
      established("b", 0.9),
      established("c", 0.85),
      established("d", 0.8),
      established("e", 0.79),
      newcomer("new", 0.4),
    ];
    const finalists = selectFinalists(pool, ["new"]);
    expect(finalists.map((c) => c.tutorId)).toEqual(["a", "b", "c", "d", "new"]);
    expect(finalists[4].rotationBoost).toBe(true);
  });

  it("rotates the reserved slot by who was matched longest ago", () => {
    const pool = [
      established("a", 0.95),
      established("b", 0.9),
      established("c", 0.85),
      established("d", 0.8),
      newcomer("recent", 0.5),
      newcomer("stale", 0.4),
    ];
    // rotationOrder is oldest-matched first.
    const finalists = selectFinalists(pool, ["stale", "recent"]);
    expect(finalists[4].tutorId).toBe("stale");
  });

  it("does not use the reserved slot when a newcomer already made it on merit", () => {
    const pool = [
      newcomer("new-strong", 0.95),
      established("b", 0.9),
      established("c", 0.85),
      established("d", 0.8),
      established("e", 0.75),
      newcomer("new-weak", 0.1),
    ];
    const finalists = selectFinalists(pool, ["new-weak"]);
    expect(finalists.map((c) => c.tutorId)).toEqual([
      "new-strong",
      "b",
      "c",
      "d",
      "e",
    ]);
    expect(finalists.some((c) => c.rotationBoost)).toBe(false);
  });

  it("falls back to pure merit when there is no eligible newcomer", () => {
    const pool = Array.from({ length: 8 }, (_, i) =>
      established(`t${i}`, 1 - i / 100),
    );
    const finalists = selectFinalists(pool, []);
    expect(finalists.map((c) => c.tutorId)).toEqual([
      "t0",
      "t1",
      "t2",
      "t3",
      "t4",
    ]);
  });
});

describe("isNewTutor", () => {
  it("is about review count, not signup date", () => {
    expect(isNewTutor(candidate({ ratingCount: 0 }))).toBe(true);
    expect(isNewTutor(candidate({ ratingCount: 2 }))).toBe(true);
    expect(isNewTutor(candidate({ ratingCount: 3 }))).toBe(false);
  });
});

describe("passesRatingFilter — rating filter never excludes unproven tutors", () => {
  it("hides an established tutor below the minimum overall rating", () => {
    expect(
      passesRatingFilter({ ratingAvg: 3.5, ratingCount: 12 }, { minRating: 4.0 }),
    ).toBe(false);
  });

  it("keeps an established tutor at or above the minimum", () => {
    expect(
      passesRatingFilter({ ratingAvg: 4.2, ratingCount: 12 }, { minRating: 4.0 }),
    ).toBe(true);
  });

  it("never excludes a tutor with fewer than NEW_TUTOR_REVIEW_THRESHOLD reviews, however high the minimum", () => {
    expect(
      passesRatingFilter({ ratingAvg: 1, ratingCount: 0 }, { minRating: 4.8 }),
    ).toBe(true);
    expect(
      passesRatingFilter({ ratingAvg: 2, ratingCount: 2 }, { minRating: 4.8 }),
    ).toBe(true);
  });

  it("applies the same unproven exemption per aspect", () => {
    expect(
      passesRatingFilter(
        { ratingAvg: 5, ratingCount: 10, clarityAvg: 3, aspectedCount: 2 },
        { minClarity: 4.5 },
      ),
    ).toBe(true); // aspectedCount below threshold: exempt
    expect(
      passesRatingFilter(
        { ratingAvg: 5, ratingCount: 10, clarityAvg: 3, aspectedCount: 6 },
        { minClarity: 4.5 },
      ),
    ).toBe(false); // enough aspected reviews, below minimum: hidden
  });

  it("passes everything when no filter is set", () => {
    expect(passesRatingFilter({ ratingAvg: 1, ratingCount: 20 }, {})).toBe(true);
  });
});
