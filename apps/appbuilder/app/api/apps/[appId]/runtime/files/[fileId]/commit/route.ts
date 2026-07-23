import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { resolveContextForRequest } from "@/lib/generated-data/routeHelpers";
import { commitUpload } from "@/lib/generated-data/files";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; fileId: string }>;
}

const MAX_COMMIT_BYTES = 25 * 1024 * 1024;

/** Persists the raw bytes for a previously-initiated upload. Body is the raw file content (never JSON) — content-length is checked before ever reading it into memory. */
export async function POST(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, fileId } = await params;
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (!declaredLength || declaredLength > MAX_COMMIT_BYTES) {
    return NextResponse.json({ error: "Missing or oversized content-length." }, { status: 413 });
  }

  try {
    const db = getDb();
    const ctx = await resolveContextForRequest(db, actor, appId, request);
    const buffer = Buffer.from(await request.arrayBuffer());
    const file = await commitUpload(db, ctx, fileId, buffer);
    return NextResponse.json({ file, simulated: ctx.simulated });
  } catch (err) {
    return errorResponse(err);
  }
}
