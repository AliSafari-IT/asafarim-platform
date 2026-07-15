import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/auth";
import { formatZodError, presignRequestSchema } from "@/lib/server/validation";
import { createPresignedUploadUrl } from "@/lib/server/storage";
import { createSession, getSessionForUser } from "@/lib/server/upload-session";

export const runtime = "nodejs";

/**
 * POST /api/uploads/presign
 *
 * Issue a short-lived presigned PUT URL for an image/audio/video asset.
 * Requires authentication. The returned `key` is scoped to the caller's user id.
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = presignRequestSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(formatZodError(parsed.error));
    }

    const { filename, contentType, sizeBytes, sessionId, category } = parsed.data;

    // Ensure session exists and belongs to caller
    let session = sessionId ? getSessionForUser(sessionId, user.id) : undefined;
    if (!session) {
      session = createSession(user.id, { source: "presign-api" });
    }

    const presigned = await createPresignedUploadUrl({
      userId: user.id,
      filename,
      contentType,
      sizeBytes,
      sessionId: session.id,
      category,
    });

    return NextResponse.json({
      ...presigned,
      sessionId: session.id,
    });
  } catch (error) {
    return serverError("uploads/presign", error);
  }
}
