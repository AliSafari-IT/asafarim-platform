import { NextRequest, NextResponse } from "next/server";
import { handleEduError, badRequest, serverError } from "@/lib/server";
import { requireRole } from "@/lib/server/profiles";
import {
  toggleReaction,
  SUPPORTED_EMOJIS,
  type SupportedEmoji,
} from "@/lib/server/verification-messages";
import { prisma } from "@asafarim/db";

export const runtime = "nodejs";

/**
 * POST /api/verification/messages/:id/reactions
 * Body: { emoji: SupportedEmoji }
 *
 * Toggles the calling user's reaction on the given message. Both admins and
 * tutors may react; the message must belong to a thread the caller participates
 * in (tutor is the caller, or caller is ADMIN).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, roles } = await requireRole("ADMIN", "TUTOR");
    const { id: messageId } = await params;

    const body = (await req.json().catch(() => null)) as
      | { emoji?: unknown }
      | null;
    const emoji = body?.emoji;
    if (
      typeof emoji !== "string" ||
      !(SUPPORTED_EMOJIS as readonly string[]).includes(emoji)
    ) {
      return badRequest(`emoji must be one of: ${SUPPORTED_EMOJIS.join(", ")}`);
    }

    const msg = await prisma.eduVerificationMessage.findUnique({
      where: { id: messageId },
      select: { tutorId: true },
    });
    if (!msg) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const isAdmin = roles.includes("ADMIN");
    const isTutor = msg.tutorId === user.id;
    if (!isAdmin && !isTutor) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const reactions = await toggleReaction(
      messageId,
      user.id,
      emoji as SupportedEmoji,
    );
    return NextResponse.json({ ok: true, reactions });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("verification/messages/reactions", error);
    }
    return serverError("verification/messages/reactions", error);
  }
}
