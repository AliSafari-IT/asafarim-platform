import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/server/profiles";
import { handleEduError, badRequest, serverError } from "@/lib/server";
import { declineQuote, QuoteError } from "@/lib/server/quotes";
import { notifyTutorOfQuoteDeclined } from "@/lib/server/notifications";
import { prisma } from "@asafarim/db";

export const runtime = "nodejs";

/**
 * POST /api/quotes/[id]/decline
 *
 * Student declines a quote. The quote status becomes DECLINED,
 * but other quotes remain available for acceptance.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireStudent();
    const { id: quoteId } = await params;

    await declineQuote(quoteId, user.id);

    // Fire-and-forget: notify tutor their quote was declined
    void (async () => {
      const quote = await prisma.eduQuote.findUnique({
        where: { id: quoteId },
        select: { tutorId: true, quoteRequest: { select: { inquiry: { select: { subject: true } } } } },
      });
      if (quote) {
        await notifyTutorOfQuoteDeclined({
          tutorId: quote.tutorId,
          subject: quote.quoteRequest.inquiry?.subject ?? "your subject",
        });
      }
    })();

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof QuoteError) {
      return badRequest(error.message);
    }
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("quotes/decline", error);
    }
    return serverError("quotes/decline", error);
  }
}
