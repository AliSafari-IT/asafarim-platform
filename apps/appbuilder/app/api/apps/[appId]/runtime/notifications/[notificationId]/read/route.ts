import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { resolveContextForRequest } from "@/lib/generated-data/routeHelpers";
import { markNotificationRead } from "@/lib/generated-data/notifications";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; notificationId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, notificationId } = await params;
  try {
    const db = getDb();
    const ctx = await resolveContextForRequest(db, actor, appId, request);
    await markNotificationRead(db, ctx, notificationId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
