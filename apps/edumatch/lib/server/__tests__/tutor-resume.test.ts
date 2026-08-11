import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@asafarim/db", () => ({
  prisma: {
    eduTutorProfile: { findUnique: vi.fn() },
    eduSessionRecord: { findMany: vi.fn() },
    eduReview: { findMany: vi.fn() },
  },
}));

import { prisma } from "@asafarim/db";
import { computeMilestones, computeStreakWeeks, getTutorResume } from "../tutor-resume";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma = prisma as any;

describe("computeMilestones", () => {
  it("returns nothing for a tutor with no history", () => {
    expect(
      computeMilestones({
        sessionsTaught: 0,
        distinctStudents: 0,
        totalTeachingMinutes: 0,
        ratingAvg: 0,
        ratingCount: 0,
        currentStreakWeeks: null,
      }),
    ).toEqual([]);
  });

  it("only awards 'highly rated' at 4.5+ over 10+ reviews", () => {
    const base = {
      sessionsTaught: 0,
      distinctStudents: 0,
      totalTeachingMinutes: 0,
      currentStreakWeeks: null,
    };
    expect(
      computeMilestones({ ...base, ratingAvg: 4.5, ratingCount: 9 }).map((m) => m.key),
    ).not.toContain("highlyRated");
    expect(
      computeMilestones({ ...base, ratingAvg: 4.4, ratingCount: 20 }).map((m) => m.key),
    ).not.toContain("highlyRated");
    expect(
      computeMilestones({ ...base, ratingAvg: 4.5, ratingCount: 10 }).map((m) => m.key),
    ).toContain("highlyRated");
  });

  it("awards multiple milestones at once, computed on read (not stored)", () => {
    const keys = computeMilestones({
      sessionsTaught: 12,
      distinctStudents: 11,
      totalTeachingMinutes: 3200,
      ratingAvg: 4.8,
      ratingCount: 15,
      currentStreakWeeks: 5,
    }).map((m) => m.key);
    expect(keys).toEqual(
      expect.arrayContaining(["highlyRated", "hours50", "students10", "streak4", "sessions5"]),
    );
  });
});

describe("computeStreakWeeks", () => {
  it("returns null when there are no attended sessions", () => {
    expect(computeStreakWeeks([])).toBeNull();
  });

  it("counts consecutive weeks ending this week", () => {
    const now = new Date("2026-08-11T12:00:00Z"); // a Tuesday
    const thisWeek = new Date("2026-08-11T09:00:00Z");
    const lastWeek = new Date("2026-08-04T09:00:00Z");
    const twoWeeksAgo = new Date("2026-07-28T09:00:00Z");
    expect(computeStreakWeeks([thisWeek, lastWeek, twoWeeksAgo], now)).toBe(3);
  });

  it("is null (not a live streak) when the current week has no session", () => {
    const now = new Date("2026-08-11T12:00:00Z");
    const lastWeek = new Date("2026-08-04T09:00:00Z");
    expect(computeStreakWeeks([lastWeek], now)).toBeNull();
  });
});

describe("getTutorResume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles a tutor with zero sessions", async () => {
    mockPrisma.eduTutorProfile.findUnique.mockResolvedValue(null);
    mockPrisma.eduSessionRecord.findMany.mockResolvedValue([]);
    mockPrisma.eduReview.findMany.mockResolvedValue([]);

    const resume = await getTutorResume("t1");

    expect(resume.sessionsTaught).toBe(0);
    expect(resume.distinctStudents).toBe(0);
    expect(resume.averageGoalProgress).toBeNull();
    expect(resume.milestones).toEqual([]);
    expect(resume.recentReviews).toEqual([]);
  });

  it("never exposes studentId or a student name in recentReviews", async () => {
    mockPrisma.eduTutorProfile.findUnique.mockResolvedValue({
      ratingAvg: 4.2,
      ratingCount: 5,
      clarityAvg: 4.5,
      reliabilityAvg: 4.0,
      engagementAvg: 4.1,
      aspectedCount: 5,
    });
    mockPrisma.eduSessionRecord.findMany.mockResolvedValue([]);
    mockPrisma.eduReview.findMany.mockResolvedValue([
      {
        rating: 5,
        clarity: 5,
        reliability: 5,
        engagement: 5,
        comment: "Great!",
        createdAt: new Date("2026-08-01"),
        booking: { quote: { brief: { subject: "Maths" } } },
      },
    ]);

    const resume = await getTutorResume("t1");

    expect(resume.recentReviews[0]).toEqual({
      rating: 5,
      clarity: 5,
      reliability: 5,
      engagement: 5,
      comment: "Great!",
      createdAt: new Date("2026-08-01"),
      subject: "Maths",
    });
    expect(resume.recentReviews[0]).not.toHaveProperty("studentId");
    expect(resume.recentReviews[0]).not.toHaveProperty("studentName");
  });

  it("computes distinct students and top subjects from session records", async () => {
    mockPrisma.eduTutorProfile.findUnique.mockResolvedValue(null);
    mockPrisma.eduSessionRecord.findMany.mockResolvedValue([
      {
        studentId: "s1",
        topicsCovered: ["Algebra"],
        goalProgress: 60,
        createdAt: new Date("2026-08-01"),
        booking: { durationMinutes: 60, status: "COMPLETED" },
      },
      {
        studentId: "s2",
        topicsCovered: ["Algebra", "Geometry"],
        goalProgress: 80,
        createdAt: new Date("2026-08-04"),
        booking: { durationMinutes: 60, status: "COMPLETED" },
      },
    ]);
    mockPrisma.eduReview.findMany.mockResolvedValue([]);

    const resume = await getTutorResume("t1");

    expect(resume.distinctStudents).toBe(2);
    expect(resume.sessionsTaught).toBe(2);
    expect(resume.totalTeachingMinutes).toBe(120);
    expect(resume.averageGoalProgress).toBe(70);
    expect(resume.subjectsTaughtWithCounts[0]).toEqual({ subject: "Algebra", sessions: 2 });
  });
});
