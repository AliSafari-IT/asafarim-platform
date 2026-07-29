import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { initAttachment } from "@/lib/repositories/attachments";
import { InitAttachmentBody } from "@/lib/validation/attachments";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/** Validates the declared type/size against the M13 attachment catalogue and mints a server-generated storage key — never returned to the client (see lib/repositories/attachments.ts). */
export async function POST(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  const raw = await request.json().catch(() => null);
  const parsed = InitAttachmentBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid attachment request." }, { status: 400 });
  }

  try {
    const db = getDb();
    const attachment = await initAttachment(db, actor, appId, {
      ...parsed.data,
      idempotencyKey: parsed.data.idempotencyKey ?? randomUUID(),
    });
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
