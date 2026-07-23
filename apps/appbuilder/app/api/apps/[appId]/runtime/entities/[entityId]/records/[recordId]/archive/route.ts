import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { resolveContextForRequest } from "@/lib/generated-data/routeHelpers";
import { archiveRecord } from "@/lib/generated-data/records";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; entityId: string; recordId: string }>;
}

/** Soft-archive — never a hard delete. Idempotent; applies the specification's relation onDelete behavior. */
export async function POST(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, entityId, recordId } = await params;
  try {
    const db = getDb();
    const ctx = await resolveContextForRequest(db, actor, appId, request);
    const record = await archiveRecord(db, ctx, entityId, recordId);
    return NextResponse.json({ record, simulated: ctx.simulated });
  } catch (err) {
    return errorResponse(err);
  }
}
