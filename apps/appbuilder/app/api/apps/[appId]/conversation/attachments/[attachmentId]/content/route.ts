import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { commitAttachmentContent, readAttachmentContentForActor } from "@/lib/repositories/attachments";
import { ATTACHMENT_MAX_BYTES, categoryForMimeType } from "@/lib/attachments/limits";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; attachmentId: string }>;
}

const MAX_CONTENT_BYTES = Math.max(...Object.values(ATTACHMENT_MAX_BYTES));

/**
 * Persists the raw bytes for a previously-initiated attachment. Body is the
 * raw file content (never JSON) — content-length is checked before ever
 * reading it into memory. This IS the "commit" step for the local proxy-
 * through-the-server upload path (docs/appbuilder-m13-multimodal-
 * contextual-assistant.md's separate `POST .../commit` route only applies
 * to a presigned-production-upload flow, which `@asafarim/storage` does not
 * support yet — see lib/repositories/attachments.ts's module docstring).
 */
export async function PUT(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, attachmentId } = await params;
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (!declaredLength || declaredLength > MAX_CONTENT_BYTES) {
    return NextResponse.json({ error: "Missing or oversized content-length." }, { status: 413 });
  }

  try {
    const db = getDb();
    const buffer = Buffer.from(await request.arrayBuffer());
    const attachment = await commitAttachmentContent(db, actor, appId, attachmentId, buffer);
    return NextResponse.json({ attachment });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Serves a `ready` attachment's stored bytes back through an app-scoped,
 * capability-checked route — M13 slice C's persisted image thumbnails point
 * here rather than at storage, keeping "raw storage keys are never
 * returned" true on the read path too. Cross-app/unrelated-actor requests
 * are an indistinguishable 404, exactly like every other app-scoped read.
 *
 * Only sniffed IMAGE types are served with their real content type for
 * inline rendering. Everything else (text, Markdown, JSON, CSV, PDF) is
 * served as an opaque download: a same-origin `text/*` response is a
 * stored-XSS vector as soon as anything navigates straight to it, and no UI
 * in this milestone renders those inline anyway. `nosniff` plus a
 * `default-src 'none'; sandbox` CSP apply to the image case too, so even a
 * mislabeled object cannot execute as script in this origin.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, attachmentId } = await params;
  try {
    const db = getDb();
    const { bytes, contentType, filename } = await readAttachmentContentForActor(db, actor, appId, attachmentId);
    const isImage = categoryForMimeType(contentType) === "image";
    // ASCII-only fallback plus RFC 5987 `filename*`: a filename containing
    // quotes, backslashes, newlines, or non-Latin-1 characters must never be
    // able to inject extra header content.
    const asciiName = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": isImage ? contentType : "application/octet-stream",
        "Content-Length": String(bytes.length),
        "Content-Disposition": `${isImage ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
        // Per-actor authorized content — never storable in a shared cache.
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
