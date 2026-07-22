import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { requestCancellation } from "@/lib/repositories/generationJobs";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; jobId: string }>;
}

/**
 * Requests cancellation of an active generation job. Idempotent and
 * repeatable — cancelling an already-cancelled job succeeds as a no-op; a
 * job that already finished (`ready`/`failed`) cannot be cancelled
 * (`ConflictError` -> 409). Requires an authorized current session for
 * this specific app (see authz.ts's "app.cancelGeneration" capability) —
 * a worker process can never self-cancel, only a real user action reaches
 * this route.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, jobId } = await params;
  try {
    const job = await requestCancellation(getDb(), actor, appId, jobId);
    return NextResponse.json({ job });
  } catch (err) {
    return errorResponse(err);
  }
}
