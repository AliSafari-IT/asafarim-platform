import { NextResponse } from "next/server";
import { getAuthedUser, unauthorized, serverError } from "@/lib/server/auth";
import { prisma } from "@asafarim/db";

export const runtime = "nodejs";

/**
 * GET /api/quotes/[id]/booking-status
 *
 * Check the booking status for a quote (used by confirmation page polling).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { id: quoteId } = await params;

    const booking = await prisma.eduBooking.findFirst({
      where: { quoteId },
      select: { id: true, status: true, stripePaymentIntentId: true },
    });

    if (!booking) {
      return NextResponse.json({ status: "NOT_FOUND" });
    }

    return NextResponse.json({
      status: booking.status,
      bookingId: booking.id,
      paymentIntentId: booking.stripePaymentIntentId,
    });
  } catch (error) {
    return serverError("booking-status", error);
  }
}
