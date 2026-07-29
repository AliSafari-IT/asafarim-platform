import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { commitAttachmentContent } from "@/lib/repositories/attachments";
import { ATTACHMENT_MAX_BYTES } from "@/lib/attachments/limits";
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
