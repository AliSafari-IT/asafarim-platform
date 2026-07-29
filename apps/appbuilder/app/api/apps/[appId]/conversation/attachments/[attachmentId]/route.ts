import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { deleteAttachment, getAttachmentForActor } from "@/lib/repositories/attachments";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; attachmentId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, attachmentId } = await params;
  try {
    const db = getDb();
    const attachment = await getAttachmentForActor(db, actor, appId, attachmentId);
    return NextResponse.json({ attachment });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, attachmentId } = await params;
  try {
    const db = getDb();
    const attachment = await deleteAttachment(db, actor, appId, attachmentId);
    return NextResponse.json({ attachment });
  } catch (err) {
    return errorResponse(err);
  }
}
