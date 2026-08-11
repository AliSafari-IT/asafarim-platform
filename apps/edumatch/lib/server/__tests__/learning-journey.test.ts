import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@asafarim/db", () => ({
  prisma: {
    eduBooking: { findFirst: vi.fn() },
    eduReview: {
      findUnique: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
    },
    eduTutorProfile: { updateMany: vi.fn() },
  },
  Prisma: {},
}));
vi.mock("../audit", () => ({ recordEduAuditEvent: vi.fn() }));

import { prisma } from "@asafarim/db";
import {
  buildInsights,
  deriveOverallRating,
  leaveReview,
  refreshTutorRating,
  reviewSchema,
  sessionRecordSchema,
  type JourneySession,
} from "../learning-journey";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma = prisma as any;

function session(
  overrides: Partial<JourneySession> & { scheduledAt: Date },
): JourneySession {
  return {
    bookingId: "b1",
    durationMinutes: 60,
    status: "COMPLETED",
    tutorId: "t1",
    tutorName: "Sam",
    subject: "Mathematics",
    topicsCovered: [],
    studentSummary: null,
    homework: null,
    nextStep: null,
    resources: [],
    goalProgress: null,
    openConcerns: [],
    attendance: "ATTENDED",
    reviewed: false,
    reviewable: false,
    ...overrides,
  };
}

const day = (n: number) => new Date(2026, 7, n);

describe("buildInsights — recurring topics", () => {
  it("flags a topic that appears in three or more sessions", () => {
    const sessions = [1, 2, 3].map((n) =>
      session({
        bookingId: `b${n}`,
        scheduledAt: day(n),
        topicsCovered: ["Factorising"],
      }),
    );
    const insights = buildInsights(sessions, []);
    expect(insights.recurringTopics).toEqual([
      { topic: "Factorising", sessions: 3 },
    ]);
  });

  it("does not flag a topic covered only twice", () => {
    const sessions = [1, 2].map((n) =>
      session({
        bookingId: `b${n}`,
        scheduledAt: day(n),
        topicsCovered: ["Factorising"],
      }),
    );
    expect(buildInsights(sessions, []).recurringTopics).toEqual([]);
  });

  it("counts a topic once per session even if the tutor repeats it", () => {
    const sessions = [1, 2, 3].map((n) =>
      session({
        bookingId: `b${n}`,
        scheduledAt: day(n),
        topicsCovered: ["Fractions", "fractions", "FRACTIONS"],
      }),
    );
    expect(buildInsights(sessions, []).recurringTopics[0].sessions).toBe(3);
  });
});

describe("buildInsights — open concerns", () => {
  it("keeps a concern open when no later session covered it", () => {
    const sessions = [
      session({
        bookingId: "b1",
        scheduledAt: day(1),
        openConcerns: ["The discriminant"],
      }),
      session({ bookingId: "b2", scheduledAt: day(2), topicsCovered: ["Graphs"] }),
    ];
    expect(buildInsights(sessions, []).openConcerns).toEqual(["The discriminant"]);
  });

  it("closes a concern once a later session covers that topic", () => {
    const sessions = [
      session({
        bookingId: "b1",
        scheduledAt: day(1),
        openConcerns: ["The discriminant"],
      }),
      session({
        bookingId: "b2",
        scheduledAt: day(2),
        topicsCovered: ["the discriminant"],
      }),
    ];
    expect(buildInsights(sessions, []).openConcerns).toEqual([]);
  });

  it("does not close a concern with an EARLIER session", () => {
    // Ordering matters: covering a topic before it was raised as a concern
    // doesn't mean it's resolved.
    const sessions = [
      session({
        bookingId: "b1",
        scheduledAt: day(1),
        topicsCovered: ["The discriminant"],
      }),
      session({
        bookingId: "b2",
        scheduledAt: day(2),
        openConcerns: ["The discriminant"],
      }),
    ];
    expect(buildInsights(sessions, []).openConcerns).toEqual(["The discriminant"]);
  });
});

describe("buildInsights — counts and trend", () => {
  const now = day(10);

  it("counts completed and upcoming separately", () => {
    const sessions = [
      session({ bookingId: "b1", scheduledAt: day(1), status: "COMPLETED" }),
      session({ bookingId: "b2", scheduledAt: day(20), status: "SCHEDULED" }),
      session({ bookingId: "b3", scheduledAt: day(2), status: "CANCELLED" }),
    ];
    const insights = buildInsights(sessions, [], now);
    expect(insights.completedSessions).toBe(1);
    expect(insights.upcomingSessions).toBe(1);
  });

  it("does not count a past scheduled session as upcoming", () => {
    const sessions = [
      session({ bookingId: "b1", scheduledAt: day(2), status: "SCHEDULED" }),
    ];
    expect(buildInsights(sessions, [], now).upcomingSessions).toBe(0);
  });

  it("returns the progress trend oldest first", () => {
    const sessions = [
      session({ bookingId: "b2", scheduledAt: day(5), goalProgress: 70 }),
      session({ bookingId: "b1", scheduledAt: day(1), goalProgress: 30 }),
    ];
    expect(
      buildInsights(sessions, [], now).progressTrend.map((p) => p.progress),
    ).toEqual([30, 70]);
  });
});

describe("buildInsights — approaching deadlines", () => {
  const now = day(10);

  it("surfaces deadlines inside the next fortnight, soonest first", () => {
    const briefs = [
      { id: "far", subject: "Physics", deadlineAt: day(40) },
      { id: "soon", subject: "Maths", deadlineAt: day(15) },
      { id: "sooner", subject: "Chemistry", deadlineAt: day(12) },
      { id: "past", subject: "History", deadlineAt: day(2) },
    ];
    const result = buildInsights([], briefs, now).approachingDeadlines;
    expect(result.map((d) => d.briefId)).toEqual(["sooner", "soon"]);
  });

  it("ignores briefs with no deadline", () => {
    const briefs = [{ id: "x", subject: "Maths", deadlineAt: null }];
    expect(buildInsights([], briefs, now).approachingDeadlines).toEqual([]);
  });
});

describe("input validation", () => {
  it("defaults a session record to ATTENDED with empty lists", () => {
    const parsed = sessionRecordSchema.parse({});
    expect(parsed.attendance).toBe("ATTENDED");
    expect(parsed.topicsCovered).toEqual([]);
    expect(parsed.openConcerns).toEqual([]);
  });

  it("rejects out-of-range goal progress", () => {
    expect(sessionRecordSchema.safeParse({ goalProgress: 120 }).success).toBe(false);
    expect(sessionRecordSchema.safeParse({ goalProgress: -1 }).success).toBe(false);
    expect(sessionRecordSchema.safeParse({ goalProgress: 100 }).success).toBe(true);
  });

  it("rejects a resource without a real URL", () => {
    expect(
      sessionRecordSchema.safeParse({
        resources: [{ label: "Worksheet", url: "not-a-url" }],
      }).success,
    ).toBe(false);
  });

  it("accepts only 1-5 star sub-aspect ratings, and no separate overall", () => {
    const valid = { clarity: 5, reliability: 4, engagement: 5 };
    expect(reviewSchema.safeParse(valid).success).toBe(true);
    expect(reviewSchema.safeParse({ ...valid, clarity: 0 }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...valid, reliability: 6 }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...valid, engagement: 3.5 }).success).toBe(false);
    expect(reviewSchema.safeParse({ clarity: 5, reliability: 5 }).success).toBe(false);
  });
});

describe("deriveOverallRating", () => {
  it("weights clarity 0.4, reliability 0.3, engagement 0.3", () => {
    expect(deriveOverallRating({ clarity: 5, reliability: 5, engagement: 5 })).toBe(5);
    expect(deriveOverallRating({ clarity: 1, reliability: 1, engagement: 1 })).toBe(1);
  });

  it("rounds to the nearest whole star for the stored `rating` field", () => {
    // 4*0.4 + 3*0.3 + 3*0.3 = 3.4 -> rounds to 3
    expect(deriveOverallRating({ clarity: 4, reliability: 3, engagement: 3 })).toBe(3);
    // 5*0.4 + 5*0.3 + 4*0.3 = 4.7 -> rounds to 5
    expect(deriveOverallRating({ clarity: 5, reliability: 5, engagement: 4 })).toBe(5);
  });
});

describe("leaveReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("derives and persists the overall rating alongside the three aspects", async () => {
    mockPrisma.eduBooking.findFirst.mockResolvedValue({
      id: "b1",
      tutorId: "t1",
      status: "COMPLETED",
    });
    mockPrisma.eduReview.findUnique.mockResolvedValue(null);
    mockPrisma.eduReview.create.mockResolvedValue({ id: "r1" });
    mockPrisma.eduReview.aggregate.mockResolvedValue({
      _avg: { rating: 4, clarity: 4, reliability: 4, engagement: 4 },
      _count: { _all: 1 },
    });
    mockPrisma.eduTutorProfile.updateMany.mockResolvedValue({ count: 1 });

    await leaveReview("b1", "s1", { clarity: 4, reliability: 4, engagement: 4 });

    expect(mockPrisma.eduReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rating: 4,
          clarity: 4,
          reliability: 4,
          engagement: 4,
        }),
      }),
    );
  });
});

describe("refreshTutorRating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recomputes all six aggregate fields, leaving aspect averages null when no review has sub-ratings", async () => {
    mockPrisma.eduReview.aggregate
      .mockResolvedValueOnce({ _avg: { rating: 3 }, _count: { _all: 2 } }) // overall
      .mockResolvedValueOnce({ _avg: { clarity: null }, _count: { _all: 0 } }) // clarity
      .mockResolvedValueOnce({ _avg: { reliability: null } }) // reliability
      .mockResolvedValueOnce({ _avg: { engagement: null } }); // engagement
    mockPrisma.eduTutorProfile.updateMany.mockResolvedValue({ count: 1 });

    await refreshTutorRating("t1");

    expect(mockPrisma.eduTutorProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ratingAvg: 3,
          ratingCount: 2,
          clarityAvg: null,
          reliabilityAvg: null,
          engagementAvg: null,
          aspectedCount: 0,
        }),
      }),
    );
  });

  it("mixes legacy (overall-only) and aspected reviews without breaking the aggregates", async () => {
    mockPrisma.eduReview.aggregate
      .mockResolvedValueOnce({ _avg: { rating: 4 }, _count: { _all: 3 } }) // overall (3 reviews total)
      .mockResolvedValueOnce({ _avg: { clarity: 4.5 }, _count: { _all: 2 } }) // 2 aspected
      .mockResolvedValueOnce({ _avg: { reliability: 4 } })
      .mockResolvedValueOnce({ _avg: { engagement: 4.5 } });
    mockPrisma.eduTutorProfile.updateMany.mockResolvedValue({ count: 1 });

    await refreshTutorRating("t1");

    expect(mockPrisma.eduTutorProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ratingAvg: 4,
          ratingCount: 3,
          clarityAvg: 4.5,
          reliabilityAvg: 4,
          engagementAvg: 4.5,
          aspectedCount: 2,
        }),
      }),
    );
  });
});
