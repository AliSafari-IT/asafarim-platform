import { NextResponse } from "next/server";
import { serverError } from "@/lib/server";
import { requireAuth, unauthorized } from "@/lib/server/auth";
import { markNotificationRead } from "@/lib/server/notifications";

export const runtime = "nodejs";

/**
 * POST /api/notifications/[id]/mark-read
 *
 * Mark a specific notification as read.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const updated = await markNotificationRead(id, user.id);

    if (!updated) {
      return NextResponse.json(
        { error: "Notification not found or already read" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorized();
    return serverError("notifications/mark-read", error);
  }
}
