import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/server/profiles";
import { handleEduError, badRequest, serverError } from "@/lib/server";
import { acceptQuote, QuoteError } from "@/lib/server/quotes";
import { notifyTutorOfQuoteAccepted } from "@/lib/server/notifications";
import { prisma } from "@asafarim/db";

export const runtime = "nodejs";

/**
 * POST /api/quotes/[id]/accept
 *
 * Student accepts a quote, which:
 * - Marks the quote as ACCEPTED
 * - Declines all other quotes for the same request
 * - Creates a booking record
 * - Transitions inquiry to BOOKED status
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireStudent();
    const { id: quoteId } = await params;

    const result = await acceptQuote(quoteId, user.id);

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
