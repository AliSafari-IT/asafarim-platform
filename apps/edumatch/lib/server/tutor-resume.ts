/**
 * The tutor's dynamic resume — a public, read-only summary of verified,
 * platform-observed accomplishments. Nothing here is self-declared: every
 * field comes from EduSessionRecord, EduBooking, or EduReview, all of which
 * are structurally tied to a COMPLETED booking. That's what makes it
 * trustworthy, and why milestones are computed on read rather than stored —
 * a stored badge can be gamed by editing history; a recomputed one can't.
 *
 * No caching yet: each query is bounded by one tutor's records. If this
 * becomes a hot path, snapshot the result as JSON on EduTutorProfile,
 * refreshed by recordSession()/leaveReview(), the same pattern already used
 * for ratingAvg/ratingCount.
 */

import { prisma } from "@asafarim/db";
import { NEW_TUTOR_REVIEW_THRESHOLD } from "./brief-matching";

export type ResumeMilestone = {
  key: string;
  labelKey: string; // i18n key, e.g. "edumatch.resume.milestone.first5"
};

export type TutorResume = {
  tutorId: string;
  sessionsTaught: number;
  distinctStudents: number;
  totalTeachingMinutes: number;
  subjectsTaughtWithCounts: Array<{ subject: string; sessions: number }>;
  averageGoalProgress: number | null;
  currentStreakWeeks: number | null;
  ratingBreakdown: {
    overall: { avg: number; count: number };
    clarity: { avg: number | null; count: number };
    reliability: { avg: number | null; count: number };
    engagement: { avg: number | null; count: number };
  };
  recentReviews: Array<{
    rating: number;
    clarity: number | null;
    reliability: number | null;
    engagement: number | null;
    comment: string | null;
    createdAt: Date;
    subject: string | null;
  }>;
  milestones: ResumeMilestone[];
};

/** Monday-anchored ISO week key, e.g. "2026-W07". */
function weekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7; // 0 = Monday
  date.setUTCDate(date.getUTCDate() - day);
  const jan1 = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - jan1.getTime()) / 86400000 + jan1.getUTCDay() + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Consecutive weeks, ending this week, with >=1 ATTENDED session. Null if the
 * current week has none (a streak that isn't still live isn't shown as one).
 */
export function computeStreakWeeks(
  attendedDates: readonly Date[],
  now: Date = new Date(),
): number | null {
  if (attendedDates.length === 0) return null;
  const weeks = new Set(attendedDates.map((d) => weekKey(d)));

  let streak = 0;
  const cursor = new Date(now);
  for (;;) {
    const key = weekKey(cursor);
    if (!weeks.has(key)) break;
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 7);
  }
  return streak > 0 ? streak : null;
}

export async function getTutorResume(tutorId: string): Promise<TutorResume> {
  const [profile, records, reviews] = await Promise.all([
    prisma.eduTutorProfile.findUnique({
      where: { userId: tutorId },
      select: {
        ratingAvg: true,
        ratingCount: true,
        clarityAvg: true,
        reliabilityAvg: true,
        engagementAvg: true,
        aspectedCount: true,
      },
    }),
    prisma.eduSessionRecord.findMany({
      where: { tutorId, attendance: "ATTENDED" },
      select: {
        studentId: true,
        topicsCovered: true,
        goalProgress: true,
        createdAt: true,
        booking: { select: { durationMinutes: true, status: true } },
      },
    }),
    prisma.eduReview.findMany({
      where: { tutorId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        rating: true,
        clarity: true,
        reliability: true,
        engagement: true,
        comment: true,
        createdAt: true,
        booking: {
          select: {
            quote: { select: { brief: { select: { subject: true } } } },
          },
        },
      },
    }),
  ]);

  const sessionsTaught = records.length;
  const distinctStudents = new Set(records.map((r) => r.studentId)).size;
  const totalTeachingMinutes = records
    .filter((r) => r.booking.status === "COMPLETED")
    .reduce((sum, r) => sum + r.booking.durationMinutes, 0);

  const subjectCounts = new Map<string, { subject: string; sessions: number }>();
  for (const r of records) {
    const seen = new Set<string>();
    for (const topic of r.topicsCovered) {
      const key = topic.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const entry = subjectCounts.get(key) ?? { subject: topic.trim(), sessions: 0 };
      entry.sessions += 1;
      subjectCounts.set(key, entry);
    }
  }
  const subjectsTaughtWithCounts = [...subjectCounts.values()]
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 5);

  const progressValues = records
    .map((r) => r.goalProgress)
    .filter((p): p is number => p !== null);
  const averageGoalProgress =
    progressValues.length > 0
      ? Math.round(
          (progressValues.reduce((s, p) => s + p, 0) / progressValues.length) * 10,
        ) / 10
      : null;

  const currentStreakWeeks = computeStreakWeeks(records.map((r) => r.createdAt));

  const ratingBreakdown = {
    overall: { avg: profile?.ratingAvg ?? 0, count: profile?.ratingCount ?? 0 },
    clarity: { avg: profile?.clarityAvg ?? null, count: profile?.aspectedCount ?? 0 },
    reliability: {
      avg: profile?.reliabilityAvg ?? null,
      count: profile?.aspectedCount ?? 0,
    },
    engagement: {
      avg: profile?.engagementAvg ?? null,
      count: profile?.aspectedCount ?? 0,
    },
  };

  // Reviewer anonymity: studentId/name are never selected above or returned.
  const recentReviews = reviews.map((r) => ({
    rating: r.rating,
    clarity: r.clarity,
    reliability: r.reliability,
    engagement: r.engagement,
    comment: r.comment,
    createdAt: r.createdAt,
    subject: r.booking.quote.brief?.subject ?? null,
  }));

  const milestones = computeMilestones({
    sessionsTaught,
    distinctStudents,
    totalTeachingMinutes,
    ratingAvg: ratingBreakdown.overall.avg,
    ratingCount: ratingBreakdown.overall.count,
    currentStreakWeeks,
  });

  return {
    tutorId,
    sessionsTaught,
    distinctStudents,
    totalTeachingMinutes,
    subjectsTaughtWithCounts,
    averageGoalProgress,
    currentStreakWeeks,
    ratingBreakdown,
    recentReviews,
    milestones,
  };
}

/**
 * Pure so thresholds are testable without a database. Only achieved
 * milestones are returned, most-significant first — never stored, so they
 * can't be gamed by editing history after the fact.
 */
export function computeMilestones(stats: {
  sessionsTaught: number;
  distinctStudents: number;
  totalTeachingMinutes: number;
  ratingAvg: number;
  ratingCount: number;
  currentStreakWeeks: number | null;
}): ResumeMilestone[] {
  const milestones: ResumeMilestone[] = [];

  if (stats.ratingAvg >= 4.5 && stats.ratingCount >= 10) {
    milestones.push({ key: "highlyRated", labelKey: "edumatch.resume.milestone.highlyRated" });
  }
  if (stats.totalTeachingMinutes >= 3000) {
    milestones.push({ key: "hours50", labelKey: "edumatch.resume.milestone.hours50" });
  }
  if (stats.distinctStudents >= 10) {
    milestones.push({ key: "students10", labelKey: "edumatch.resume.milestone.students10" });
  }
  if (stats.currentStreakWeeks !== null && stats.currentStreakWeeks >= 4) {
    milestones.push({ key: "streak4", labelKey: "edumatch.resume.milestone.streak4" });
  }
  if (stats.sessionsTaught >= 5) {
    milestones.push({ key: "sessions5", labelKey: "edumatch.resume.milestone.sessions5" });
  }

  return milestones;
}

/**
 * Whether a tutor's rating is confident enough to display plainly. Below the
 * new-tutor threshold, callers should show a "new" badge instead of a bare
 * average — see NEW_TUTOR_REVIEW_THRESHOLD in brief-matching.ts.
 */
export function isRatingConfident(ratingCount: number): boolean {
  return ratingCount >= NEW_TUTOR_REVIEW_THRESHOLD;
}
