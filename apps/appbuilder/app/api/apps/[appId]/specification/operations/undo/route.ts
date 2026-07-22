import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { undoLastOperation } from "@/lib/repositories/versions";
import { requestPreviewBuild } from "@/lib/repositories/previewService";
import { UndoOperationBody } from "@/lib/validation/conversations";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/**
 * Undoes the operation that produced the current version via its safe
 * inverse (M04's `invertOperation`) — never by rewriting or deleting the
 * current version. Returns `RestoreRequiredError` (409, `code:
 * "restore_required"`) when no safe inverse exists; the client should offer
 * "Restore an earlier version" instead in that case.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  const raw = await request.json().catch(() => null);
  const parsed = UndoOperationBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "A baseVersionNumber is required to undo." }, { status: 400 });
  }

  try {
    const db = getDb();
    const { version } = await undoLastOperation(db, actor, appId, {
      baseVersionNumber: parsed.data.baseVersionNumber,
      idempotencyKey: parsed.data.idempotencyKey ?? randomUUID(),
    });
    const { build } = await requestPreviewBuild(db, actor, appId);
    return NextResponse.json({ version, previewBuild: build });
  } catch (err) {
    return errorResponse(err);
  }
}
