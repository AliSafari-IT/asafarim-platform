import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { resolveContextForRequest } from "@/lib/generated-data/routeHelpers";
import { getDashboardCounts } from "@/lib/generated-data/query";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/** Bounded per-entity counts for statWidget rendering — `?entityIds=a,b,c` (max 20, enforced in getDashboardCounts). */
export async function GET(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  const url = new URL(request.url);
  const entityIds = (url.searchParams.get("entityIds") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  try {
    const db = getDb();
    const ctx = await resolveContextForRequest(db, actor, appId, request);
    const counts = await getDashboardCounts(db, ctx, entityIds);
    return NextResponse.json({ counts, simulated: ctx.simulated });
  } catch (err) {
    return errorResponse(err);
  }
}
