import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { resolveContextForRequest } from "@/lib/generated-data/routeHelpers";
import { initUpload } from "@/lib/generated-data/files";
import { InitUploadBody } from "@/lib/validation/runtime";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/** Validates the declared MIME/size against the target field's own allowlist and mints a server-generated storage key — never a client-chosen one. */
export async function POST(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  const raw = await request.json().catch(() => null);
  const parsed = InitUploadBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  try {
    const db = getDb();
    const ctx = await resolveContextForRequest(db, actor, appId, request);
    const result = await initUpload(db, ctx, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
