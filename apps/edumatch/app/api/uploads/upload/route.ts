import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/server/profiles";
import { handleEduError } from "@/lib/server";
import { badRequest, serverError } from "@/lib/server/auth";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_BYTES,
  MIN_FILE_BYTES,
  type AllowedMime,
} from "@/lib/server/validation";
import { directUpload } from "@/lib/server/storage";

export const runtime = "nodejs";

/**
 * POST /api/uploads/upload
 *
 * Accepts a multipart/form-data body with a single "file" field.
 * Presigns a storage URL server-side, PUTs the bytes from the server
 * (avoiding any browser CORS requirement), and returns the attachment
 * descriptor ready for the inquiry intake payload.
 *
 * The browser only ever talks to our own origin — no cross-origin PUT.
 */
export async function POST(req: Request) {
  try {
    const { user } = await requireStudent();

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
    const { key, publicUrl } = await directUpload(
      user.id,
      file.name,
      file.type as AllowedMime,
      buffer,
    );

    return NextResponse.json({
      key,
      url: publicUrl,
      mime: file.type,
      sizeBytes: file.size,
      filename: file.name,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("uploads/upload", error);
    }
    return serverError("uploads/upload", error);
  }
}
