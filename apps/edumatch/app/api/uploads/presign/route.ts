import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/server/profiles";
import { handleEduError } from "@/lib/server";
import { badRequest, serverError } from "@/lib/server/auth";
import { formatZodError, presignRequestSchema } from "@/lib/server/validation";
import { createPresignedUploadUrl } from "@/lib/server/storage";

export const runtime = "nodejs";

/**
 * POST /api/uploads/presign
 *
 * Issue a short-lived presigned PUT URL for an inquiry attachment.
 * STUDENT-only. The returned `key` is bound to the caller's user id; the
 * inquiry create endpoint refuses keys that belong to other users.
 */
export async function POST(req: Request) {
  try {
    const { user } = await requireStudent();

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = presignRequestSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(formatZodError(parsed.error));
    }

    const presigned = await createPresignedUploadUrl({
      userId: user.id,
      filename: parsed.data.filename,
      contentType: parsed.data.contentType,
      sizeBytes: parsed.data.sizeBytes,
    });

    return NextResponse.json(presigned);
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("uploads/presign", error);
    }
    return serverError("uploads/presign", error);
  }
}
