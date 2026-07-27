import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { rollbackToRelease } from "@/lib/repositories/deployments";
import { nudgeDeploymentWorker } from "@/lib/server/queue";
import { generateId } from "@/lib/db/ids";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; releaseId: string }>;
}

/**
 * Enqueues a rollback of production to this (earlier, already-published)
 * release. This never rewrites release history — it creates a new
 * `deployments` row that runs through the same activate/verify pipeline as
 * a forward deploy, just pointed at an older release. Runs entirely in the
 * durable worker, same as a forward deploy.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, releaseId } = await params;
  const raw = await request.json().catch(() => ({}) as Record<string, unknown>);
  const idempotencyKey = typeof raw.idempotencyKey === "string" && raw.idempotencyKey.length > 0 ? raw.idempotencyKey : generateId();

  try {
    const deployment = await rollbackToRelease(getDb(), actor, appId, { targetReleaseId: releaseId, idempotencyKey });
    await nudgeDeploymentWorker(deployment.id, { cause: "enqueue" });
    return NextResponse.json({ deployment }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
