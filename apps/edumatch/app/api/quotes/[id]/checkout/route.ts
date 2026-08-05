import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/server/profiles";
import { handleEduError, badRequest, serverError } from "@/lib/server";
import { createBookingPaymentIntent, isStripeConfigured } from "@/lib/server/stripe";
import { prisma } from "@asafarim/db";

export const runtime = "nodejs";

/**
 * POST /api/quotes/[id]/checkout
 *
 * Create a PaymentIntent for a quote.
 * Returns client_secret for Stripe Elements.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireStudent();
    const { id: quoteId } = await params;

    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Stripe not configured. Set STRIPE_SECRET_KEY." },
        { status: 503 },
      );
    }

    // Verify quote exists and belongs to this student
    const quote = await prisma.eduQuote.findFirst({
      where: { id: quoteId, status: "PENDING" },
      include: {
        quoteRequest: {
          select: { studentId: true, inquiry: { select: { subject: true } } },
        },
        tutor: {
          select: { eduTutorProfile: { select: { stripeAccountId: true, payoutEnabled: true } } },
        },
      },
    });

    if (!quote) {
      return badRequest("Quote not found or not available for checkout.");
    }

    if (quote.quoteRequest.studentId !== user.id) {
      return badRequest("Access denied.");
    }

    if (!quote.tutor.eduTutorProfile?.stripeAccountId) {
      return badRequest("Tutor has not completed payment setup.");
    }

    if (!quote.tutor.eduTutorProfile?.payoutEnabled) {
      return badRequest("Tutor payment account is not fully verified.");
    }

    const result = await createBookingPaymentIntent(
      quoteId,
      quote.totalCents,
      quote.tutor.eduTutorProfile.stripeAccountId,
      `Booking for ${quote.quoteRequest.inquiry.subject} tutoring`,
    );

    if (!result.success) {
      return badRequest(result.error);
    }

    return NextResponse.json({
      clientSecret: result.clientSecret,
      paymentIntentId: result.paymentIntentId,
      amount: quote.totalCents,
      currency: "eur",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("checkout", error);
    }
    return serverError("checkout", error);
  }
}
