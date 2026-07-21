import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { restoreApp } from "@/lib/repositories/apps";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/**
 * Owner-only, idempotent restoration back to an active draft state.
 * `restoreApp` enforces the "app.restore" capability and the same
 * leak-prevention behavior as every other app-scoped mutation. Restoring an
 * already-active app is a no-op success, safe to retry.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  try {
    const app = await restoreApp(getDb(), actor, appId);
    return NextResponse.json({ app });
  } catch (err) {
    return errorResponse(err);
  }
}
