import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getArtifactsForActor } from "@/lib/repositories/validationRuns";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; runId: string }>;
}

/** Artifact metadata (never the raw bytes — see the [artifactId] route for that) for this run, access-controlled identically to the run itself. */
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, runId } = await params;
  try {
    const artifacts = await getArtifactsForActor(getDb(), actor, appId, runId);
    return NextResponse.json({ artifacts });
  } catch (err) {
    return errorResponse(err);
  }
}
