/**
 * The bridge between a confirmed Learning Brief and the tutoring marketplace:
 * match → invite → compare.
 *
 * Everything up to `confirmBrief` is a private conversation. Everything after
 * it is a coordinated request to a small, fixed set of tutors. This module
 * owns that transition and the comparison view the student uses afterwards.
 */

import { prisma, type Prisma } from "@asafarim/db";
import { recordEduAuditEvent } from "./audit";
import {
  matchTutorsForBrief,
  saveMatchCandidates,
  type MatchResult,
  type TutorCandidate,
} from "./brief-matching";
import { BriefError } from "./learning-briefs";
import type { BriefFields } from "./learning-brief";
import { notifyTutorsOfQuoteRequest } from "./notifications";
import type { PlanStep } from "./lesson-proposals";

export const INVITE_EXPIRY_HOURS = 48;

export type MatchSummary = {
  briefId: string;
  quoteRequestId: string;
  expiresAt: Date;
  candidates: TutorCandidate[];
  consideredCount: number;
  /** Present only for admins; students never see why others were dropped. */
  excluded?: MatchResult["excluded"];
};

function rowToFields(row: {
  subject: string;
  topic: string | null;
  educationalLevel: string;
  learningObjective: string | null;
  difficulties: string[];
  prerequisiteGaps: string[];
  language: string;
  mode: string;
  availability: Prisma.JsonValue | null;
  deadlineAt: Date | null;
  deadlineKind: string | null;
  estimatedSessions: number | null;
  sessionMinutes: number | null;
}): BriefFields {
  return {
    subject: row.subject || undefined,
    topic: row.topic ?? undefined,
    educationalLevel:
      (row.educationalLevel as BriefFields["educationalLevel"]) || undefined,
    learningObjective: row.learningObjective ?? undefined,
    difficulties: row.difficulties,
    prerequisiteGaps: row.prerequisiteGaps,
    language: row.language,
    mode: row.mode as BriefFields["mode"],
    availability: (row.availability as BriefFields["availability"]) ?? undefined,
    deadlineAt: row.deadlineAt ?? undefined,
    deadlineKind: (row.deadlineKind as BriefFields["deadlineKind"]) ?? undefined,
    estimatedSessions: row.estimatedSessions ?? undefined,
    sessionMinutes: row.sessionMinutes ?? undefined,
  };
}

/**
 * Preview the match without inviting anyone. Used on the brief review screen
 * so the student can see who they'd be shown *before* deciding to share — the
 * brief is theirs until they say otherwise.
 */
export async function previewMatches(
  briefId: string,
  studentId: string,
): Promise<{ candidates: TutorCandidate[]; consideredCount: number }> {
  const { brief, ctx } = await loadMatchContext(briefId, studentId);
  const result = await matchTutorsForBrief(ctx);
  await saveMatchCandidates(brief.id, result.finalists);
  return {
    candidates: result.finalists,
    consideredCount: result.consideredCount,
  };
}

async function loadMatchContext(briefId: string, studentId: string) {
  const brief = await prisma.eduLearningBrief.findFirst({
    where: { id: briefId, studentId },
  });
  if (!brief) throw new BriefError("Learning brief not found.", "NOT_FOUND");

  const profile = await prisma.eduStudentProfile.findUnique({
    where: { userId: studentId },
    select: { homeLat: true, homeLng: true, isMinor: true },
  });

  // Brief location wins over profile location: the student may be asking for a
  // tutor near their school rather than near home.
  const lat = brief.locationLat ?? profile?.homeLat ?? null;
  const lng = brief.locationLng ?? profile?.homeLng ?? null;

  return {
    brief,
    ctx: {
      fields: rowToFields(brief),
      studentLocation: lat !== null && lng !== null ? { lat, lng } : null,
      studentIsMinor: profile?.isMinor ?? false,
    },
  };
}

/**
 * Share the confirmed brief with the matched tutors.
 *
 * Creates one quote request, attaches the candidates to it, and notifies only
 * those tutors. Re-running it on an already-matched brief reuses the open
 * request rather than fanning the same brief out twice.
 */
export async function matchAndInvite(
  briefId: string,
  studentId: string,
): Promise<MatchSummary> {
  const { brief, ctx } = await loadMatchContext(briefId, studentId);

  if (!brief.confirmedAt) {
    throw new BriefError(
      "Confirm your learning brief before we share it with tutors.",
      "INVALID_STATE",
    );
  }
  if (!brief.inquiryId) {
    throw new BriefError(
      "This brief is not linked to an inquiry yet.",
      "INVALID_STATE",
    );
  }

  const existing = await prisma.eduQuoteRequest.findFirst({
    where: { briefId, studentId, status: "OPEN", expiresAt: { gt: new Date() } },
    include: { matchCandidates: true },
  });

  const result = await matchTutorsForBrief(ctx);
  if (result.finalists.length === 0) {
    throw new BriefError(
      "We couldn't find a verified tutor who matches this brief yet. We'll keep looking and let you know.",
      "INCOMPLETE",
    );
  }

  const expiresAt =
    existing?.expiresAt ??
    new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);

  const quoteRequest =
    existing ??
    (await prisma.eduQuoteRequest.create({
      data: {
        inquiryId: brief.inquiryId,
        studentId,
        briefId,
        expiresAt,
        status: "OPEN",
      },
    }));

  await saveMatchCandidates(briefId, result.finalists, quoteRequest.id);

  await prisma.$transaction([
    prisma.eduLearningBrief.update({
      where: { id: briefId },
      data: { status: "MATCHED" },
    }),
    prisma.eduInquiry.update({
      where: { id: brief.inquiryId },
      data: { status: "TUTOR_REQUESTED" },
    }),
  ]);

  void notifyTutorsOfQuoteRequest({
    tutorIds: result.finalists.map((c) => c.tutorId),
    quoteRequestId: quoteRequest.id,
    subject: brief.subject,
    gradeLevel: brief.educationalLevel,
    isInvited: true,
  });

  void recordEduAuditEvent({
    actorId: studentId,
    actorRole: "STUDENT",
    action: "QUOTE_REQUEST_CREATED",
    entity: "EduQuoteRequest",
    entityId: quoteRequest.id,
    nextState: "OPEN",
    metadata: {
      briefId,
      invited: result.finalists.map((c) => c.tutorId),
      rotationSlotUsed: result.finalists.some((c) => c.rotationBoost),
      consideredCount: result.consideredCount,
    },
  });

  return {
    briefId,
    quoteRequestId: quoteRequest.id,
    expiresAt,
    candidates: result.finalists,
    consideredCount: result.consideredCount,
  };
}

// ─── Comparison ───────────────────────────────────────────────────────────

/**
 * One row of the comparison table. Every proposal exposes the same fields —
 * that consistency is the whole point, because comparing a "€30/hr" against a
 * "€180 package" is how students end up guessing.
 */
export type ProposalComparison = {
  quoteId: string;
  tutorId: string;
  tutorName: string | null;
  tutorImage: string | null;
  verified: boolean;
  qualifications: string[];
  subjectsTaught: string[];
  levelsTaught: string[];
  teachingStyle: string | null;
  languagesTaught: string[];
  ratingAvg: number;
  ratingCount: number;
  hourlyRateCents: number;
  totalCents: number;
  sessionCount: number | null;
  sessionMinutes: number | null;
  mode: string | null;
  language: string | null;
  earliestStartAt: Date | null;
  planOutline: PlanStep[];
  cancellationPolicy: string | null;
  notes: string | null;
  status: string;
  sentAt: Date | null;
  /** Why we invited this tutor, carried over from the match. */
  matchReasons: string[];
  matchScore: number | null;
  rotationBoost: boolean;
};

/**
 * Everything the student needs to choose, for one brief. Only proposals the
 * tutor actually sent are included — drafts are the tutor's workspace.
 */
export async function compareProposals(
  briefId: string,
  studentId: string,
): Promise<ProposalComparison[]> {
  const brief = await prisma.eduLearningBrief.findFirst({
    where: { id: briefId, studentId },
    select: { id: true },
  });
  if (!brief) throw new BriefError("Learning brief not found.", "NOT_FOUND");

  const [quotes, candidates] = await Promise.all([
    prisma.eduQuote.findMany({
      where: {
        briefId,
        status: { in: ["PENDING", "SENT", "ACCEPTED"] },
        sentAt: { not: null },
      },
      include: {
        tutor: {
          select: {
            id: true,
            name: true,
            image: true,
            eduTutorProfile: {
              select: {
                qualifications: true,
                subjectsTaught: true,
                levelsTaught: true,
                languagesTaught: true,
                teachingStyle: true,
                ratingAvg: true,
                ratingCount: true,
                verifiedAt: true,
              },
            },
          },
        },
      },
      orderBy: { totalCents: "asc" },
    }),
    prisma.eduMatchCandidate.findMany({ where: { briefId } }),
  ]);

  const byTutor = new Map(candidates.map((c) => [c.tutorId, c]));

  return quotes.map((q) => {
    const profile = q.tutor.eduTutorProfile;
    const candidate = byTutor.get(q.tutorId);
    return {
      quoteId: q.id,
      tutorId: q.tutorId,
      tutorName: q.tutor.name,
      tutorImage: q.tutor.image,
      verified: profile?.verifiedAt != null,
      qualifications: profile?.qualifications ?? [],
      subjectsTaught: profile?.subjectsTaught ?? [],
      levelsTaught: profile?.levelsTaught ?? [],
      teachingStyle: profile?.teachingStyle ?? null,
      languagesTaught: profile?.languagesTaught ?? [],
      ratingAvg: profile?.ratingAvg ?? 0,
      ratingCount: profile?.ratingCount ?? 0,
      hourlyRateCents: q.hourlyRateCents,
      totalCents: q.totalCents,
      sessionCount: q.sessionCount,
      sessionMinutes: q.sessionMinutes,
      mode: q.mode,
      language: q.language,
      earliestStartAt: q.earliestStartAt,
      planOutline: Array.isArray(q.planOutline)
        ? (q.planOutline as unknown as PlanStep[])
        : [],
      cancellationPolicy: q.cancellationPolicy,
      notes: q.notes,
      status: q.status,
      sentAt: q.sentAt,
      matchReasons: candidate?.reasons ?? [],
      matchScore: candidate?.score ?? null,
      rotationBoost: candidate?.rotationBoost ?? false,
    };
  });
}

/**
 * Factual, non-ranking differences between proposals, phrased the way the
 * product spec asks for: "€5 more per hour but can start this week". We
 * deliberately never conclude which is better — that judgement belongs to the
 * student, and a platform that makes it is selling placement.
 */
export function describeDifferences(
  proposals: readonly ProposalComparison[],
): string[] {
  if (proposals.length < 2) return [];

  const notes: string[] = [];
  const byPrice = [...proposals].sort((a, b) => a.totalCents - b.totalCents);
  const cheapest = byPrice[0];
  const dearest = byPrice[byPrice.length - 1];

  if (dearest.totalCents > cheapest.totalCents) {
    const delta = (dearest.totalCents - cheapest.totalCents) / 100;
    notes.push(
      `${dearest.tutorName ?? "One tutor"} costs €${delta.toFixed(0)} more in total than ${cheapest.tutorName ?? "the lowest quote"}.`,
    );
  }

  const startable = proposals.filter((p) => p.earliestStartAt);
  if (startable.length > 1) {
    const soonest = startable.reduce((a, b) =>
      a.earliestStartAt! <= b.earliestStartAt! ? a : b,
    );
    notes.push(
      `${soonest.tutorName ?? "One tutor"} can start first, on ${soonest.earliestStartAt!.toISOString().slice(0, 10)}.`,
    );
  }

  const experienced = proposals.filter((p) => p.ratingCount >= 3);
  if (experienced.length > 0 && experienced.length < proposals.length) {
    notes.push(
      `${experienced.length} of these tutors have verified lesson reviews; the others are newer to EduMatch.`,
    );
  }

  const lengths = new Set(
    proposals.map((p) => `${p.sessionCount}×${p.sessionMinutes}`),
  );
  if (lengths.size > 1) {
    notes.push(
      "The proposed plans differ in length — check the total number of lessons, not just the hourly rate.",
    );
  }

  return notes;
}
