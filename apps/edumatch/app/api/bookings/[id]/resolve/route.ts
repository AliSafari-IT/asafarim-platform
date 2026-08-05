import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/server/profiles";
import { handleEduError, badRequest, serverError } from "@/lib/server";
import {
  resolveDispute,
  BookingTransitionError,
} from "@/lib/server/bookings";

export const runtime = "nodejs";

/**
 * POST /api/bookings/:id/resolve  (ADMIN only)
 *
 * Body: { resolution: "REFUND" | "NO_REFUND" | "REQUEST_INFO", reason: string, refundCents?: number }
 *
 * Resolves a disputed booking. REFUND cancels the booking and records a
 * REFUND EduTransaction (no Stripe call). NO_REFUND marks the booking
 * COMPLETED.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRole("ADMIN");
    const { id: bookingId } = await params;
    const body = (await req.json().catch(() => null)) as
      | { resolution?: string; reason?: string; refundCents?: number }
      | null;
    const resolution = body?.resolution;
    const reason = body?.reason?.trim();
    if (
      !resolution ||
      (resolution !== "REFUND" &&
        resolution !== "NO_REFUND" &&
        resolution !== "REQUEST_INFO")
    ) {
      return badRequest("resolution must be REFUND, NO_REFUND, or REQUEST_INFO");
    }
    if (!reason) return badRequest("reason is required");

    const updated = await resolveDispute({
      bookingId,
      adminId: user.id,
      resolution,
      reason,
      refundCents:
        typeof body?.refundCents === "number" && body.refundCents > 0
          ? body.refundCents
          : undefined,
    });
    return NextResponse.json({ booking: updated });
  } catch (error) {
    if (error instanceof BookingTransitionError) {
      return badRequest(error.reason);
    }
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("bookings/resolve", error);
    }
    return serverError("bookings/resolve", error);
  }
}
