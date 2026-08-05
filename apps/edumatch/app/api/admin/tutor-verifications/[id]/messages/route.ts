import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/server/profiles";
import { handleEduError, badRequest, serverError } from "@/lib/server";
import {
  listVerificationThread,
  postVerificationMessage,
  markThreadRead,
} from "@/lib/server/verification-messages";

export const runtime = "nodejs";

/**
 * GET /api/admin/tutor-verifications/:id/messages
 *
 * `:id` is the tutorId. Returns the full verification thread and marks the
 * tutor's messages as read (the admin is viewing them).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole("ADMIN");
    const { id: tutorId } = await params;
    await markThreadRead(tutorId, "ADMIN");
    const messages = await listVerificationThread(tutorId);
    return NextResponse.json({ tutorId, messages });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("admin/tutor-verifications/messages", error);
    }
    return serverError("admin/tutor-verifications/messages", error);
  }
}

/**
 * POST /api/admin/tutor-verifications/:id/messages
 *
 * Admin sends a follow-up message to the tutor (independent of a status
 * change). Body: { body: string }.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRole("ADMIN");
    const { id: tutorId } = await params;
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
        tutorId,
        senderId: user.id,
        senderRole: "ADMIN",
        body: body?.body ?? "",
        attachments: body?.attachments,
      });
    } catch (e) {
      return badRequest(e instanceof Error ? e.message : "Invalid message.");
    }
    const messages = await listVerificationThread(tutorId);
    return NextResponse.json({ ok: true, messages });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("admin/tutor-verifications/messages", error);
    }
    return serverError("admin/tutor-verifications/messages", error);
  }
}
