import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { requireTutor } from "@/lib/server/profiles";
import { handleBriefError } from "@/lib/server/brief-errors";

export const runtime = "nodejs";

/**
 * GET /api/tutors/invites
 *
 * Brief-driven invitations addressed to this tutor. Distinct from
 * `/api/tutors/quote-requests`, which is the open marketplace feed: these are
 * requests where the platform selected this tutor for a specific student and
 * has already prepared a proposal for them.
 *
 * Declined and already-sent requests drop out of the list — this is a to-do,
 * not a history.
 */
export async function GET() {
  try {
    const { user } = await requireTutor();

    const candidates = await prisma.eduMatchCandidate.findMany({
      where: {
        tutorId: user.id,
        invitedAt: { not: null },
        quoteRequest: { status: "OPEN", expiresAt: { gt: new Date() } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        quoteRequest: { select: { id: true, expiresAt: true } },
        brief: {
          select: {
            subject: true,
            topic: true,
            educationalLevel: true,
            learningObjective: true,
            deadlineAt: true,
            deadlineKind: true,
            language: true,
            mode: true,
            locationCity: true,
            estimatedSessions: true,
            sessionMinutes: true,
          },
        },
      },
    });

    const quoteRequestIds = candidates
      .map((c) => c.quoteRequest?.id)
      .filter((id): id is string => Boolean(id));
    const myQuotes = await prisma.eduQuote.findMany({
      where: { tutorId: user.id, quoteRequestId: { in: quoteRequestIds } },
      select: { quoteRequestId: true, status: true },
    });
    const statusByRequest = new Map(
      myQuotes.map((q) => [q.quoteRequestId, q.status]),
    );

    const items = candidates
      .filter((c) => {
        const status = c.quoteRequest
          ? statusByRequest.get(c.quoteRequest.id)
          : undefined;
        return status === undefined || status === "DRAFT";
      })
      .map((c) => ({
        quoteRequestId: c.quoteRequest!.id,
        expiresAt: c.quoteRequest!.expiresAt,
        invitedAt: c.invitedAt,
        whyYou: c.reasons,
        brief: c.brief,
      }));

    return NextResponse.json({ items, total: items.length });
  } catch (error) {
    return handleBriefError("tutors/invites", error);
  }
}
