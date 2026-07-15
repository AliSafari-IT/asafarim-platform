import { NextResponse } from "next/server";
import { getAuthedUser, badRequest, serverError, unauthorized } from "@/lib/server/auth";
import { ALLOWED_UPLOAD_MIME_TYPES, MAX_IMAGE_BYTES } from "@/lib/server/validation";
import { isKeyOwnedBy, putObjectBytes } from "@/lib/server/storage";

export const runtime = "nodejs";

function getFormString(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === "string" && value.length > 0 ? value : null;
}

function inferContentType(file: File): string {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "wav") return "audio/wav";
  if (extension === "ogg") return "audio/ogg";
  if (extension === "m4a" || extension === "mp4") return "audio/mp4";
  if (extension === "webm") return "audio/webm";
  return "application/octet-stream";
}

export async function POST(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const form = await req.formData().catch(() => null);
    if (!form) return badRequest("Expected multipart upload body.");

    const key = getFormString(form, "key");
    if (!key || key.length > 512) return badRequest("Missing upload key.");
    if (!isKeyOwnedBy(key, user.id)) {
      return badRequest("Upload key does not belong to the authenticated user.");
    }

    const file = form.get("file");
    if (!(file instanceof File)) return badRequest("Missing upload file.");
    if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {
      return badRequest(`File must be between 1 and ${MAX_IMAGE_BYTES} bytes.`);
    }
    const contentType = inferContentType(file);
    if (!ALLOWED_UPLOAD_MIME_TYPES.includes(contentType as (typeof ALLOWED_UPLOAD_MIME_TYPES)[number])) {
      return badRequest("Unsupported upload content type.");
    }

    const body = Buffer.from(await file.arrayBuffer());
    console.log("[uploads/proxy] Uploading object", { key, size: body.length, contentType });
    const publicUrl = await putObjectBytes(key, body, contentType);
    console.log("[uploads/proxy] Upload successful", { key, publicUrl });

    return NextResponse.json({
      ok: true,
      key,
      publicUrl,
      sizeBytes: body.length,
    });
  } catch (error) {
    console.error("[uploads/proxy] Error:", error);
    return serverError("uploads/proxy", error);
  }
}
