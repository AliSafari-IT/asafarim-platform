import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { createDeployment, listDeploymentsForActor } from "@/lib/repositories/deployments";
import { nudgeDeploymentWorker } from "@/lib/server/queue";
import { generateId } from "@/lib/db/ids";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/** Deployment history for the deployment panel — newest first. */
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  try {
    const deployments = await listDeploymentsForActor(getDb(), actor, appId);
    return NextResponse.json({ deployments });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Enqueues a forward deployment of an already-APPROVED release. Runs
 * entirely in the durable worker (lib/deployment/pipeline.ts) — this route
 * only creates the row (with a fresh transactional eligibility recheck) and
 * nudges the worker, never activates anything itself.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  const raw = await request.json().catch(() => ({}) as Record<string, unknown>);
  const releaseId = typeof raw.releaseId === "string" ? raw.releaseId : "";
  if (!releaseId) {
    return NextResponse.json({ error: "releaseId is required", code: "invalid_request" }, { status: 400 });
  }
  const idempotencyKey = typeof raw.idempotencyKey === "string" && raw.idempotencyKey.length > 0 ? raw.idempotencyKey : generateId();

  try {
    const deployment = await createDeployment(getDb(), actor, appId, { releaseId, idempotencyKey });
    await nudgeDeploymentWorker(deployment.id, { cause: "enqueue" });
    return NextResponse.json({ deployment }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
