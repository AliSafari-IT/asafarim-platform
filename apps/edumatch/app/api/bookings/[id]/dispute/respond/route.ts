import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/server/auth";
import { handleEduError, badRequest, serverError } from "@/lib/server";
import { getEduRoles } from "@/lib/server/profiles";
import {
  BookingTransitionError,
  respondToDispute,
} from "@/lib/server/bookings";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: bookingId } = await params;
    const body = (await req.json().catch(() => null)) as
      | { message?: string }
      | null;
    const message = body?.message?.trim();
    if (!message) return badRequest("message is required");

    const roles = await getEduRoles(user);
    const actorRole = roles.includes("STUDENT")
      ? "STUDENT"
      : roles.includes("TUTOR")
        ? "TUTOR"
        : null;
    if (!actorRole) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const booking = await respondToDispute({
      bookingId,
      actorId: user.id,
      actorRole,
      message,
    });

    return NextResponse.json({ booking });
  } catch (error) {
    if (error instanceof BookingTransitionError) {
      return badRequest(error.reason);
    }
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("bookings/dispute/respond", error);
    }
    return serverError("bookings/dispute/respond", error);
  }
}
