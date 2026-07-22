import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { creationRequests } from "@/lib/db/schema";
import { enqueueGenerationJob, getLatestGenerationJobForActor } from "@/lib/repositories/generationJobs";
import { NotFoundError } from "@/lib/errors";
import { errorResponse, unauthorized } from "@/lib/http/errors";
import { nudgeWorker } from "@/lib/server/queue";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/** Latest generation job for this app (any status), or `null` if none was ever requested. */
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  try {
    const job = await getLatestGenerationJobForActor(getDb(), actor, appId);
    return NextResponse.json({ job });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Enqueues a new generation job for this app's existing creation request —
 * used both right after `/apps/new` (see actions.ts) and for an explicit
 * "Retry generation" action after a prior job failed or was cancelled.
 * Idempotent per request: a client-supplied `idempotencyKey` in the JSON
 * body lets a retried HTTP request (network retry, double click) return the
 * same job rather than creating a second one; omit it to always mint a
 * fresh job (e.g. a deliberate "Retry" click after a failure).
 */
export async function POST(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  let idempotencyKey: string | undefined;
  try {
    const body = await request.json().catch(() => ({}) as Record<string, unknown>);
    if (typeof body.idempotencyKey === "string" && body.idempotencyKey.length >= 8) {
      idempotencyKey = body.idempotencyKey;
    }
  } catch {
    // No body / invalid JSON — fine, we mint our own key below.
  }

  try {
    const db = getDb();
    const [creationRequest] = await db.select().from(creationRequests).where(eq(creationRequests.appId, appId)).limit(1);
    if (!creationRequest) throw new NotFoundError("Creation request for app", appId);

    const job = await enqueueGenerationJob(db, actor, appId, {
      creationRequestId: creationRequest.id,
      requestedTemplateId: creationRequest.starterFamily,
      idempotencyKey: idempotencyKey ?? randomUUID(),
    });
    await nudgeWorker(job.id, { cause: "enqueue" });
    return NextResponse.json({ job }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
