import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { restoreVersion } from "@/lib/repositories/versions";
import { requestPreviewBuild } from "@/lib/repositories/previewService";
import { RestoreVersionBody } from "@/lib/validation/conversations";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; versionNumber: string }>;
}

/**
 * Restores an older version AS A NEW VERSION — owner-only (see authz.ts's
 * `app.restoreVersion`, editor/M08 conversational policy does not include
 * restoring history). Never mutates, deletes, or renumbers the historical
 * version being restored from. Also requests a fresh preview build for the
 * new version so "Open preview" reflects the restored state immediately;
 * released/production pointers (M11) are never touched by this route.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, versionNumber } = await params;
  const targetVersionNumber = Number.parseInt(versionNumber, 10);
  if (!Number.isInteger(targetVersionNumber) || targetVersionNumber < 0) {
    return NextResponse.json({ error: "Invalid version number." }, { status: 400 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = RestoreVersionBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "A baseVersionNumber is required to restore a version." }, { status: 400 });
  }

  try {
    const db = getDb();
    const { version } = await restoreVersion(db, actor, appId, {
      targetVersionNumber,
      baseVersionNumber: parsed.data.baseVersionNumber,
      idempotencyKey: parsed.data.idempotencyKey ?? randomUUID(),
    });
    const { build } = await requestPreviewBuild(db, actor, appId);
    return NextResponse.json({ version, previewBuild: build });
  } catch (err) {
    return errorResponse(err);
  }
}
