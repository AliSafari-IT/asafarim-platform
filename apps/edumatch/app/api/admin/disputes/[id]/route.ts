import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/server/profiles";
import { handleEduError, badRequest, serverError } from "@/lib/server";
import { resolveDispute } from "@/lib/server/bookings";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRole("ADMIN");
    const { id: bookingId } = await params;
    const body = (await req.json().catch(() => null)) as {
      resolution?: string;
      reason?: string;
      refundCents?: number;
    } | null;

    if (!body?.resolution || !body?.reason) {
      return badRequest("resolution and reason are required");
    }
    if (!["REFUND", "NO_REFUND", "REQUEST_INFO"].includes(body.resolution)) {
      return badRequest("resolution must be REFUND, NO_REFUND, or REQUEST_INFO");
    }

    const booking = await resolveDispute({
      bookingId,
      adminId: user.id,
      resolution: body.resolution as "REFUND" | "NO_REFUND" | "REQUEST_INFO",
      reason: body.reason,
      refundCents: body.refundCents,
    });

    return NextResponse.json({ ok: true, booking });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("admin/disputes/[id]", error);
    }
    if (error instanceof Error && error.name === "BookingTransitionError") {
      return badRequest(error.message);
    }
    return serverError("admin/disputes/[id]", error);
  }
}
