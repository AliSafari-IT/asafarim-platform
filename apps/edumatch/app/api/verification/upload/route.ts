import { NextResponse } from "next/server";
import { requireAuth, badRequest, serverError, unauthorized } from "@/lib/server/auth";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_BYTES,
  MIN_FILE_BYTES,
  type AllowedMime,
} from "@/lib/server/validation";
import { directUpload, getSignedDownloadUrl } from "@/lib/server/storage";

export const runtime = "nodejs";

/**
 * POST /api/verification/upload
 *
 * Multipart upload for verification-message attachments. Usable by any
 * authenticated user (admin or tutor). The bytes are PUT server-side to the
 * private bucket; the returned `key` is scoped to the uploader and the `url`
 * is a short-lived signed GET for immediate preview in the composer.
 */
export async function POST(req: Request) {
  try {
    const user = await requireAuth();

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return badRequest("Invalid multipart body");
    }

    const fileEntry = formData.get("file");
    if (!(fileEntry instanceof File)) return badRequest("No file in request");
    const file = fileEntry;

    if (!ALLOWED_MIME_TYPES.includes(file.type as AllowedMime)) {
      return badRequest(`Unsupported file type: ${file.type}`);
    }
    if (file.size > MAX_FILE_BYTES) return badRequest("File exceeds 50 MB limit");
    if (file.size < MIN_FILE_BYTES) return badRequest("File is empty");

    const buffer = await file.arrayBuffer();
    const { key } = await directUpload(
      user.id,
      file.name,
      file.type as AllowedMime,
      buffer,
    );
    const url = await getSignedDownloadUrl(key);

    return NextResponse.json({
      key,
      url,
      mime: file.type,
      sizeBytes: file.size,
      filename: file.name,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return serverError("verification/upload", error);
  }
}
