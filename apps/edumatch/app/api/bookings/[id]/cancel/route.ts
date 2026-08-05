import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/server/auth";
import { handleEduError, badRequest, serverError } from "@/lib/server";
import { getEduRoles } from "@/lib/server/profiles";
import {
  cancelBooking,
  BookingTransitionError,
} from "@/lib/server/bookings";

export const runtime = "nodejs";

/**
 * POST /api/bookings/:id/cancel
 *
 * Body: { reason: string }
 *
 * Either party (student or tutor) on the booking can cancel.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: bookingId } = await params;
    const body = (await req.json().catch(() => null)) as
      | { reason?: string }
      | null;
    const reason = body?.reason?.trim();
    if (!reason) return badRequest("reason is required");

    const roles = await getEduRoles(user);
    // Pick the most-privileged role we can assert. Auth helper inside cancelBooking
    // also enforces ownership when role is STUDENT or TUTOR.
    const actorRole = roles.includes("ADMIN")
      ? "ADMIN"
      : roles.includes("STUDENT")
        ? "STUDENT"
        : roles.includes("TUTOR")
          ? "TUTOR"
          : null;
    if (!actorRole) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await cancelBooking({
      bookingId,
      actorId: user.id,
      actorRole,
      reason,
    });
    return NextResponse.json({ booking: updated });
  } catch (error) {
    if (error instanceof BookingTransitionError) {
      return badRequest(error.reason);
    }
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("bookings/cancel", error);
    }
    return serverError("bookings/cancel", error);
  }
}
