import { NextRequest, NextResponse } from "next/server";
import { requireTutor } from "@/lib/server/profiles";
import { handleEduError, badRequest, serverError } from "@/lib/server";
import { getCurrentVerification } from "@/lib/server/tutor-verification";
import {
  listVerificationThread,
  postVerificationMessage,
  markThreadRead,
} from "@/lib/server/verification-messages";

export const runtime = "nodejs";

/**
 * GET /api/tutor/verification
 *
 * Returns the signed-in tutor's current verification status and the full
 * message thread with admins. Opening the thread marks admin messages read.
 */
export async function GET() {
  try {
    const { user } = await requireTutor();
    await markThreadRead(user.id, "TUTOR");
    const [current, messages] = await Promise.all([
      getCurrentVerification(user.id),
      listVerificationThread(user.id),
    ]);
    return NextResponse.json({
      status: current?.status ?? "PENDING",
      resolvedAt: current?.resolvedAt ?? null,
      messages,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("tutor/verification", error);
    }
    return serverError("tutor/verification", error);
  }
}

/**
 * POST /api/tutor/verification
 *
 * Tutor replies in their verification thread. Body: { body: string }.
 * Notifies the admin who last reviewed them (if known).
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireTutor();
    const body = (await req.json().catch(() => null)) as
      | { body?: string; attachments?: unknown }
      | null;
    const hasAttachments =
      Array.isArray(body?.attachments) && body.attachments.length > 0;
    if (!body?.body?.trim() && !hasAttachments) {
      return badRequest("Message body or an attachment is required.");
    }
    try {
      await postVerificationMessage({
        tutorId: user.id,
        senderId: user.id,
        senderRole: "TUTOR",
        body: body?.body ?? "",
        attachments: body?.attachments,
      });
    } catch (e) {
      return badRequest(e instanceof Error ? e.message : "Invalid message.");
    }
    const messages = await listVerificationThread(user.id);
    return NextResponse.json({ ok: true, messages });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("tutor/verification", error);
    }
    return serverError("tutor/verification", error);
  }
}
