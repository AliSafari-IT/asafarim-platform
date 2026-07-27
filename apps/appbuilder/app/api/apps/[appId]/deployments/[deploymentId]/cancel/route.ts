import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { requestDeploymentCancellation } from "@/lib/repositories/deployments";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; deploymentId: string }>;
}

/** Requests cancellation of an active deployment. Only honored BEFORE the production pointer has moved (409 otherwise) — once activated, a rollback is the only way back. */
export async function POST(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, deploymentId } = await params;
  try {
    const deployment = await requestDeploymentCancellation(getDb(), actor, appId, deploymentId);
    return NextResponse.json({ deployment });
  } catch (err) {
    return errorResponse(err);
  }
}
