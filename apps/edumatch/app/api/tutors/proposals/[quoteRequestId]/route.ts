import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { requireTutor } from "@/lib/server/profiles";
import { handleBriefError } from "@/lib/server/brief-errors";
import { getOrCreatePreparedProposal } from "@/lib/server/lesson-proposals";
import {
  normaliseAvailability,
  type AvailabilityWindow,
} from "@/lib/server/learning-brief";
import { signAttachments } from "@/lib/server/storage";

export const runtime = "nodejs";

/**
 * GET /api/tutors/proposals/[quoteRequestId]
 *
 * Everything a tutor needs to answer in about a minute: the student's full
 * Learning Brief, and a proposal already filled in from it. Creating the draft
 * on read is what makes the one-click case possible — the tutor opens the
 * request and the plan is already there.
 *
 * The draft is invisible to the student until POST .../send.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ quoteRequestId: string }> },
) {
  try {
    const { user } = await requireTutor();
    const { quoteRequestId } = await params;

    const prepared = await getOrCreatePreparedProposal(quoteRequestId, user.id);

    const request = await prisma.eduQuoteRequest.findUnique({
      where: { id: quoteRequestId },
      select: {
        id: true,
        expiresAt: true,
        status: true,
        brief: true,
        matchCandidates: {
          where: { tutorId: user.id },
          select: { reasons: true, rank: true, rotationBoost: true },
        },
      },
    });
    // getOrCreatePreparedProposal already refused anything without a brief or
    // an invite, so a miss here means the row vanished between the two reads.
    if (!request?.brief) {
      return NextResponse.json({ error: "Request not found." }, { status: 404 });
    }

    const brief = request.brief;
    return NextResponse.json({
      quoteId: prepared.quoteId,
      status: prepared.status,
      draft: prepared.draft,
      expiresAt: request.expiresAt,
      whyYou: request.matchCandidates[0]?.reasons ?? [],
      brief: {
        id: brief.id,
        subject: brief.subject,
        topic: brief.topic,
        educationalLevel: brief.educationalLevel,
        schoolYear: brief.schoolYear,
        learningObjective: brief.learningObjective,
        currentUnderstanding: brief.currentUnderstanding,
        difficulties: brief.difficulties,
        prerequisiteGaps: brief.prerequisiteGaps,
        language: brief.language,
        mode: brief.mode,
        locationCity: brief.locationCity,
        // Normalised on read so a brief stored before the merge fix doesn't
        // show a tutor a wall of repeated windows.
        availability: Array.isArray(brief.availability)
          ? normaliseAvailability(
              brief.availability as unknown as AvailabilityWindow[],
            )
          : null,
        deadlineAt: brief.deadlineAt,
        deadlineKind: brief.deadlineKind,
        accessibilityNeeds: brief.accessibilityNeeds,
        estimatedSessions: brief.estimatedSessions,
        sessionMinutes: brief.sessionMinutes,
        // The student's own materials — signed on read because the bucket is
        // private. These are the exercises the tutor should prepare from.
        attachments: await signAttachments(brief.attachments),
      },
    });
  } catch (error) {
    return handleBriefError("tutors/proposals", error);
  }
}
