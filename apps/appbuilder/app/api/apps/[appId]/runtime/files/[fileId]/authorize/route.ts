import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { resolveContextForRequest } from "@/lib/generated-data/routeHelpers";
import { getDownloadAuthorization } from "@/lib/generated-data/files";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; fileId: string }>;
}

/** Mints a short-lived (5 minute) signed download URL — the ONLY way to obtain one; the download route itself accepts no other form of authorization. */
export async function POST(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, fileId } = await params;
  try {
    const db = getDb();
    const ctx = await resolveContextForRequest(db, actor, appId, request);
    const { token, expiresAt } = await getDownloadAuthorization(db, ctx, fileId);
    return NextResponse.json({
      downloadUrl: `/api/apps/${encodeURIComponent(appId)}/runtime/files/${encodeURIComponent(fileId)}/download?token=${encodeURIComponent(token)}`,
      token,
      expiresAt,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
