import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/server/auth";
import { handleEduError, badRequest, serverError, unauthorized } from "@/lib/server";
import { acceptQuote, QuoteError } from "@/lib/server/quotes";
import { notifyTutorOfQuoteAccepted } from "@/lib/server/notifications";
import { prisma } from "@asafarim/db";

export const runtime = "nodejs";

/**
 * POST /api/quotes/[id]/accept
 *
 * Accepts a quote, which:
 * - Marks the quote as ACCEPTED
 * - Declines all other quotes for the same request
 * - Creates a booking record
 * - Transitions inquiry to BOOKED status
 *
 * Ordinarily the caller *is* the student. A parent may instead accept on
 * behalf of one of their managed children by passing `{ studentId }` in the
 * body — `acceptQuote`/`authorizeBookingActor` enforce that relationship
 * server-side; this route doesn't need to know which case it's in.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();
    const { id: quoteId } = await params;

    const body = (await req.json().catch(() => ({}))) as { studentId?: unknown };
    const studentId =
      typeof body.studentId === "string" && body.studentId.length > 0
        ? body.studentId
        : undefined;

    const result = await acceptQuote(quoteId, user.id, studentId);

    // Fire-and-forget: notify the tutor their quote was accepted
    void (async () => {
      const quote = await prisma.eduQuote.findUnique({
        where: { id: quoteId },
        select: {
          tutorId: true,
          quoteRequest: { select: { inquiryId: true, inquiry: { select: { subject: true } } } },
          tutor: { select: { name: true, email: true } },
        },
      });
      if (quote) {
        await notifyTutorOfQuoteAccepted({
          tutorId: quote.tutorId,
          tutorEmail: quote.tutor.email ?? null,
          tutorName: quote.tutor.name ?? null,
          studentName: user.email,
          bookingId: result.bookingId,
          subject: quote.quoteRequest.inquiry?.subject ?? "your subject",
        });
      }
    })();

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof QuoteError) {
      return badRequest(error.message);
    }
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("quotes/accept", error);
    }
    return serverError("quotes/accept", error);
  }
}
