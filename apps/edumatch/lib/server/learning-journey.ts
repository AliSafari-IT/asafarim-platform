/**
 * The learning journey — what turns EduMatch from a tutor marketplace into a
 * learning companion.
 *
 * After a lesson the tutor records what was covered; the student gets a short
 * summary and the next recommended step; the original learning goal moves; a
 * verified review becomes possible. Over time the accumulated records answer
 * questions no single session can: which topics keep coming back, whether
 * progress is real, what prerequisite is still missing underneath.
 *
 * Two integrity rules:
 * - A session record can only be written by the tutor who taught it, and only
 *   for a booking that is COMPLETED or SCHEDULED-and-past. There is no path to
 *   "reviewing" a lesson that never happened.
 * - A review requires a COMPLETED booking. That is what makes reviews
 *   verified — there is no separate flag to forge.
 */

import { prisma, type Prisma } from "@asafarim/db";
import { z } from "zod";
import { recordEduAuditEvent } from "./audit";

export class JourneyError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "INVALID_STATE" = "INVALID_STATE",
  ) {
    super(message);
    this.name = "JourneyError";
  }
}

export const ATTENDANCE_VALUES = ["ATTENDED", "PARTIAL", "NO_SHOW"] as const;
export type Attendance = (typeof ATTENDANCE_VALUES)[number];

export const sessionRecordSchema = z.object({
  attendance: z.enum(ATTENDANCE_VALUES).default("ATTENDED"),
  topicsCovered: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  tutorNotes: z.string().trim().max(4000).optional(),
  studentSummary: z.string().trim().max(2000).optional(),
  homework: z.string().trim().max(2000).optional(),
  nextStep: z.string().trim().max(1000).optional(),
  resources: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(200),
        url: z.string().url().max(2000),
      }),
    )
    .max(10)
    .default([]),
  goalProgress: z.number().int().min(0).max(100).optional(),
  openConcerns: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
});
export type SessionRecordInput = z.infer<typeof sessionRecordSchema>;

/**
 * Weights for deriving the overall rating from the three sub-aspects. Clarity
 * is weighted highest because it's the core of teaching; kept in one place so
 * the formula is tunable without a migration.
 */
export const RATING_ASPECT_WEIGHTS = {
  clarity: 0.4,
  reliability: 0.3,
  engagement: 0.3,
} as const;

export function deriveOverallRating(aspects: {
  clarity: number;
  reliability: number;
  engagement: number;
}): number {
  const raw =
    aspects.clarity * RATING_ASPECT_WEIGHTS.clarity +
    aspects.reliability * RATING_ASPECT_WEIGHTS.reliability +
    aspects.engagement * RATING_ASPECT_WEIGHTS.engagement;
  return Math.min(5, Math.max(1, Math.round(raw)));
}

/**
 * Students never enter a separate overall star rating — it is derived from
 * the three sub-aspects in leaveReview() via deriveOverallRating(). This
 * removes the halo effect and any contradiction between an overall and its
 * parts.
 */
export const reviewSchema = z.object({
  clarity: z.number().int().min(1).max(5),
  reliability: z.number().int().min(1).max(5),
  engagement: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

// ─── Session records ──────────────────────────────────────────────────────

/**
 * Write (or overwrite) the record of what happened in a lesson. Upsert rather
 * than insert because tutors realistically finish a session, jot the essentials
 * in a hurry, and complete the notes later that evening.
 */
export async function recordSession(
  bookingId: string,
  tutorId: string,
  input: SessionRecordInput,
): Promise<{ id: string }> {
  const booking = await prisma.eduBooking.findFirst({
    where: { id: bookingId, tutorId },
    select: {
      id: true,
      studentId: true,
      status: true,
      scheduledAt: true,
      quote: { select: { briefId: true } },
    },
  });
  if (!booking) throw new JourneyError("Booking not found.", "NOT_FOUND");

  const hasHappened =
    booking.status === "COMPLETED" ||
    (booking.status === "SCHEDULED" && booking.scheduledAt <= new Date());
  if (!hasHappened) {
    throw new JourneyError(
      "You can only write a session record after the lesson has taken place.",
      "INVALID_STATE",
    );
  }
  if (booking.status === "CANCELLED") {
    throw new JourneyError("This booking was cancelled.", "INVALID_STATE");
  }

  const data = {
    briefId: booking.quote.briefId,
    tutorId,
    studentId: booking.studentId,
    attendance: input.attendance,
    topicsCovered: input.topicsCovered,
    tutorNotes: input.tutorNotes ?? null,
    studentSummary: input.studentSummary ?? null,
    homework: input.homework ?? null,
    nextStep: input.nextStep ?? null,
    resources: input.resources as unknown as Prisma.InputJsonValue,
    goalProgress: input.goalProgress ?? null,
    openConcerns: input.openConcerns,
  };

  const record = await prisma.eduSessionRecord.upsert({
    where: { bookingId },
    create: { bookingId, ...data },
    update: data,
    select: { id: true },
  });

  // A recorded, attended session is what "completed" means in practice; the
  // North Star metric counts these, so the booking follows the record.
  if (input.attendance === "ATTENDED" && booking.status === "SCHEDULED") {
    await prisma.eduBooking.update({
      where: { id: bookingId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  }

  void recordEduAuditEvent({
    actorId: tutorId,
    actorRole: "TUTOR",
    action: "SESSION_RECORDED",
    entity: "EduSessionRecord",
    entityId: record.id,
    prevState: booking.status,
    nextState: input.attendance,
    metadata: { bookingId, topics: input.topicsCovered.length },
  });

  return record;
}

// ─── Reviews ──────────────────────────────────────────────────────────────

/**
 * Leave a verified review. Only possible against a completed booking, and only
 * once — the unique constraint on bookingId is the enforcement, this check is
 * the friendly error.
 */
export async function leaveReview(
  bookingId: string,
  studentId: string,
  input: ReviewInput,
): Promise<{ id: string }> {
  const booking = await prisma.eduBooking.findFirst({
    where: { id: bookingId, studentId },
    select: { id: true, tutorId: true, status: true },
  });
  if (!booking) throw new JourneyError("Booking not found.", "NOT_FOUND");
  if (booking.status !== "COMPLETED") {
    throw new JourneyError(
      "You can review a lesson once it has been completed.",
      "INVALID_STATE",
    );
  }

  const existing = await prisma.eduReview.findUnique({ where: { bookingId } });
  if (existing) {
    throw new JourneyError(
      "You have already reviewed this lesson.",
      "INVALID_STATE",
    );
  }

  const rating = deriveOverallRating(input);

  const review = await prisma.eduReview.create({
    data: {
      bookingId,
      studentId,
      tutorId: booking.tutorId,
      rating,
      clarity: input.clarity,
      reliability: input.reliability,
      engagement: input.engagement,
      comment: input.comment ?? null,
    },
    select: { id: true },
  });

  await refreshTutorRating(booking.tutorId);

  void recordEduAuditEvent({
    actorId: studentId,
    actorRole: "STUDENT",
    action: "REVIEW_SUBMITTED",
    entity: "EduReview",
    entityId: review.id,
    metadata: { bookingId, rating },
  });

  return review;
}

type RatingAggregateRow = {
  rating_avg: number | null;
  rating_count: bigint;
  clarity_avg: number | null;
  reliability_avg: number | null;
  engagement_avg: number | null;
  aspected_count: bigint;
};

/**
 * Recompute the tutor's rating from their verified reviews. Derived rather
 * than incremented so a deleted or moderated review can never leave the
 * displayed average permanently wrong. Also recomputes the three cached
 * per-aspect averages (null when no review has sub-ratings — i.e. all
 * legacy) so the compare list can filter without re-aggregating.
 *
 * One query rather than one aggregate per column: `ratingCount` needs every
 * review while `aspectedCount` needs only reviews with sub-ratings, which a
 * single Prisma `aggregate()` call can't express per-column. Postgres'
 * `FILTER` clause can, so the four aggregates that used to be four
 * sequential round-trips are now one.
 */
export async function refreshTutorRating(tutorId: string): Promise<void> {
  const [row] = await prisma.$queryRaw<RatingAggregateRow[]>`
    SELECT
      AVG(rating)::float AS rating_avg,
      COUNT(*) AS rating_count,
      AVG(clarity)::float AS clarity_avg,
      AVG(reliability)::float AS reliability_avg,
      AVG(engagement)::float AS engagement_avg,
      COUNT(*) FILTER (WHERE clarity IS NOT NULL) AS aspected_count
    FROM "EduReview"
    WHERE "tutorId" = ${tutorId}
  `;

  const round2 = (n: number | null) =>
    n === null ? null : Math.round(n * 100) / 100;

  await prisma.eduTutorProfile.updateMany({
    where: { userId: tutorId },
    data: {
      ratingAvg: round2(row?.rating_avg ?? 0) ?? 0,
      ratingCount: Number(row?.rating_count ?? 0),
      clarityAvg: round2(row?.clarity_avg ?? null),
      reliabilityAvg: round2(row?.reliability_avg ?? null),
      engagementAvg: round2(row?.engagement_avg ?? null),
      aspectedCount: Number(row?.aspected_count ?? 0),
    },
  });
}

// ─── The learning record ──────────────────────────────────────────────────

export type JourneySession = {
  bookingId: string;
  scheduledAt: Date;
  durationMinutes: number;
  status: string;
  tutorId: string;
  tutorName: string | null;
  subject: string | null;
  topicsCovered: string[];
  studentSummary: string | null;
  homework: string | null;
  nextStep: string | null;
  resources: Array<{ label: string; url: string }>;
  goalProgress: number | null;
  openConcerns: string[];
  attendance: string | null;
  reviewed: boolean;
  reviewable: boolean;
};

export type JourneyInsights = {
  /** Topics that came up in three or more sessions — a persistent weak spot. */
  recurringTopics: Array<{ topic: string; sessions: number }>;
  /** Concerns the tutor flagged that no later session has covered again. */
  openConcerns: string[];
  /** Goal progress over time, oldest first, for a simple trend. */
  progressTrend: Array<{ at: Date; progress: number }>;
  completedSessions: number;
  upcomingSessions: number;
  /** Briefs whose deadline is inside the next fortnight. */
  approachingDeadlines: Array<{ briefId: string; subject: string; deadlineAt: Date }>;
};

export type LearningJourney = {
  sessions: JourneySession[];
  insights: JourneyInsights;
};

export async function getLearningJourney(
  studentId: string,
): Promise<LearningJourney> {
  const [bookings, briefs] = await Promise.all([
    prisma.eduBooking.findMany({
      where: { studentId },
      orderBy: { scheduledAt: "desc" },
      take: 100,
      include: {
        tutor: { select: { id: true, name: true } },
        sessionRecord: true,
        review: { select: { id: true } },
        quote: {
          select: {
            brief: { select: { subject: true, topic: true } },
            quoteRequest: {
              select: { inquiry: { select: { subject: true } } },
            },
          },
        },
      },
    }),
    prisma.eduLearningBrief.findMany({
      where: {
        studentId,
        status: { in: ["CONFIRMED", "MATCHED"] },
        deadlineAt: { not: null },
      },
      select: { id: true, subject: true, deadlineAt: true },
    }),
  ]);

  const sessions: JourneySession[] = bookings.map((b) => {
    const record = b.sessionRecord;
    return {
      bookingId: b.id,
      scheduledAt: b.scheduledAt,
      durationMinutes: b.durationMinutes,
      status: b.status,
      tutorId: b.tutor.id,
      tutorName: b.tutor.name,
      subject:
        b.quote.brief?.subject ?? b.quote.quoteRequest.inquiry.subject ?? null,
      topicsCovered: record?.topicsCovered ?? [],
      studentSummary: record?.studentSummary ?? null,
      homework: record?.homework ?? null,
      nextStep: record?.nextStep ?? null,
      resources: Array.isArray(record?.resources)
        ? (record.resources as unknown as Array<{ label: string; url: string }>)
        : [],
      goalProgress: record?.goalProgress ?? null,
      openConcerns: record?.openConcerns ?? [],
      attendance: record?.attendance ?? null,
      reviewed: b.review !== null,
      reviewable: b.status === "COMPLETED" && b.review === null,
    };
  });

  return { sessions, insights: buildInsights(sessions, briefs) };
}

/**
 * Pure so the pattern-detection rules can be tested without a database — these
 * are the statements the product makes back to the student about their own
 * learning, and getting them wrong is worse than not making them.
 */
export function buildInsights(
  sessions: readonly JourneySession[],
  briefs: ReadonlyArray<{ id: string; subject: string; deadlineAt: Date | null }>,
  now: Date = new Date(),
): JourneyInsights {
  const oldestFirst = [...sessions].sort(
    (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime(),
  );

  const topicCounts = new Map<string, { label: string; count: number }>();
  for (const session of oldestFirst) {
    // Count each topic once per session; a tutor listing "fractions" three
    // times in one record does not make it a recurring struggle.
    const seen = new Set<string>();
    for (const topic of session.topicsCovered) {
      const key = topic.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const entry = topicCounts.get(key) ?? { label: topic.trim(), count: 0 };
      entry.count += 1;
      topicCounts.set(key, entry);
    }
  }

  const recurringTopics = [...topicCounts.values()]
    .filter((t) => t.count >= 3)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((t) => ({ topic: t.label, sessions: t.count }));

  // A concern counts as open until a *later* session covers that topic.
  const openConcerns: string[] = [];
  for (let i = 0; i < oldestFirst.length; i += 1) {
    const later = oldestFirst.slice(i + 1);
    for (const concern of oldestFirst[i].openConcerns) {
      const key = concern.trim().toLowerCase();
      if (!key) continue;
      const addressed = later.some((s) =>
        s.topicsCovered.some((t) => t.trim().toLowerCase() === key),
      );
      if (!addressed && !openConcerns.includes(concern.trim())) {
        openConcerns.push(concern.trim());
      }
    }
  }

  const progressTrend = oldestFirst
    .filter((s) => s.goalProgress !== null)
    .map((s) => ({ at: s.scheduledAt, progress: s.goalProgress as number }));

  const fortnight = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  return {
    recurringTopics,
    openConcerns: openConcerns.slice(0, 8),
    progressTrend,
    completedSessions: sessions.filter((s) => s.status === "COMPLETED").length,
    upcomingSessions: sessions.filter(
      (s) => s.status === "SCHEDULED" && s.scheduledAt > now,
    ).length,
    approachingDeadlines: briefs
      .filter(
        (b) => b.deadlineAt !== null && b.deadlineAt > now && b.deadlineAt <= fortnight,
      )
      .map((b) => ({
        briefId: b.id,
        subject: b.subject,
        deadlineAt: b.deadlineAt as Date,
      }))
      .sort((a, b) => a.deadlineAt.getTime() - b.deadlineAt.getTime()),
  };
}
