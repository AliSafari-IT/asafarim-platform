import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { enqueueValidationRun, listValidationRunsForActor } from "@/lib/repositories/validationRuns";
import { nudgeValidationWorker } from "@/lib/server/queue";
import { generateId } from "@/lib/db/ids";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/** Run history for this app's builder workspace Validation panel — newest first. */
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  try {
    const runs = await listValidationRunsForActor(getDb(), actor, appId);
    return NextResponse.json({ runs });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Requests a new validation run against the app's CURRENT specification
 * version, pinned immediately (see lib/repositories/validationRuns.ts).
 * Runs entirely in the durable worker — this route only creates the row and
 * nudges the worker, never executes a gate itself (issue requirement: "do
 * not run full QA inside HTTP requests"). A fresh idempotency key is
 * generated per request (a "rerun" is always a NEW run, never a replay of
 * an old one) unless the caller supplies one for its own retry-safety.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  const raw = await request.json().catch(() => ({}) as Record<string, unknown>);
  const idempotencyKey = typeof raw.idempotencyKey === "string" && raw.idempotencyKey.length > 0 ? raw.idempotencyKey : generateId();

  try {
    const db = getDb();
    const run = await enqueueValidationRun(db, actor, appId, { idempotencyKey, requestSource: "manual" });
    await nudgeValidationWorker(run.id, { cause: "enqueue" });
    return NextResponse.json({ run }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
