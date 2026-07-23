import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { resolveContextForRequest } from "@/lib/generated-data/routeHelpers";
import { getGroupedCounts } from "@/lib/generated-data/query";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; entityId: string }>;
}

/** Bounded group-by count over a single select field — the only aggregate shape chartWidget needs. */
export async function GET(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, entityId } = await params;
  const url = new URL(request.url);
  const groupByFieldId = url.searchParams.get("groupByFieldId");
  if (!groupByFieldId) {
    return NextResponse.json({ error: "groupByFieldId is required." }, { status: 400 });
  }

  try {
    const db = getDb();
    const ctx = await resolveContextForRequest(db, actor, appId, request);
    const counts = await getGroupedCounts(db, ctx, entityId, groupByFieldId);
    return NextResponse.json({ counts, simulated: ctx.simulated });
  } catch (err) {
    return errorResponse(err);
  }
}
