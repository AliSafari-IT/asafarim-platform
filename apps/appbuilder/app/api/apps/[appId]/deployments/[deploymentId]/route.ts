import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getDeploymentForActor, listDeploymentSteps } from "@/lib/repositories/deployments";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; deploymentId: string }>;
}

/** Polled by the deployment panel for live progress — the deployment row plus its safe, redacted per-phase logs. */
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, deploymentId } = await params;
  try {
    const db = getDb();
    const deployment = await getDeploymentForActor(db, actor, appId, deploymentId);
    const steps = await listDeploymentSteps(db, deploymentId);
    return NextResponse.json({ deployment, steps });
  } catch (err) {
    return errorResponse(err);
  }
}
