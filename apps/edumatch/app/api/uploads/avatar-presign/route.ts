import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/server/profiles";
import { handleEduError } from "@/lib/server";
import { badRequest, serverError } from "@/lib/server/auth";
import { formatZodError, avatarPresignRequestSchema } from "@/lib/server/validation";
import { createPresignedAvatarUploadUrl } from "@/lib/server/storage";
import { isUnder13 } from "@/lib/server/age";
import { AvatarError } from "@/lib/server/avatars";

export const runtime = "nodejs";

/**
 * POST /api/uploads/avatar-presign
 *
 * A separate, stricter presign endpoint from /api/uploads/presign: image
 * MIME types only, 2 MB cap, keys under `avatars/{userId}/...` instead of
 * `inquiries/{userId}/...`.
 *
 * Age-gated here too, not just at the point the key is later applied via
 * PATCH /api/student/avatar — a check that only ran at "set avatar" time
 * would still let an under-13 student burn a presigned URL and upload a
 * photo to storage, even if it were never linked to their profile.
 */
export async function POST(req: Request) {
  try {
    const { user, profile } = await requireStudent();

    if (isUnder13(profile.dateOfBirth)) {
      throw new AvatarError(403, "Photo upload is only available for users 13 or older.");
    }

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = avatarPresignRequestSchema.safeParse(body);
    if (!parsed.success) return badRequest(formatZodError(parsed.error));

    const presigned = await createPresignedAvatarUploadUrl({
      userId: user.id,
      filename: parsed.data.filename,
      contentType: parsed.data.contentType,
      sizeBytes: parsed.data.sizeBytes,
    });

    return NextResponse.json(presigned);
  } catch (error) {
    if (error instanceof AvatarError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("uploads/avatar-presign", error);
    }
    return serverError("uploads/avatar-presign", error);
  }
}
