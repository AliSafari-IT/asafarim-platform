import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getValidationRunForActor, getGateResultsForActor } from "@/lib/repositories/validationRuns";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; runId: string }>;
}

/** Polled by the workspace's Validation panel — the run row plus every gate result, for rendering truthful progress, the gate list, and the release-eligible banner. */
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, runId } = await params;
  try {
    const db = getDb();
    const [run, gates] = await Promise.all([
      getValidationRunForActor(db, actor, appId, runId),
      getGateResultsForActor(db, actor, appId, runId),
    ]);
    return NextResponse.json({ run, gates });
  } catch (err) {
    return errorResponse(err);
  }
}
