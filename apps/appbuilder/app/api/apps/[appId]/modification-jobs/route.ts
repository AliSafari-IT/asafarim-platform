import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getLatestModificationJobForActor } from "@/lib/repositories/modificationJobs";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/**
 * Latest modification job for this app (any status), or `null` if none was
 * ever requested — polled by the workspace to reconnect to an active job
 * after refresh, tab close/reopen, or a device switch (persisted state is
 * authoritative, never browser-only state).
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  try {
    const job = await getLatestModificationJobForActor(getDb(), actor, appId);
    return NextResponse.json({ job });
  } catch (err) {
    return errorResponse(err);
  }
}
