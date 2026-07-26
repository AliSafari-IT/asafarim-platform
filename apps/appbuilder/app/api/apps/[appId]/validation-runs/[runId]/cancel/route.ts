import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { requestCancellation } from "@/lib/repositories/validationRuns";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; runId: string }>;
}

/** Requests cancellation of an active validation run — idempotent (already-cancelled is a no-op); a terminal run cannot be cancelled (409). */
export async function POST(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, runId } = await params;
  try {
    const run = await requestCancellation(getDb(), actor, appId, runId);
    return NextResponse.json({ run });
  } catch (err) {
    return errorResponse(err);
  }
}
