import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { enqueueRepairAttempt, listRepairAttemptsForRun } from "@/lib/repositories/repairAttempts";
import { nudgeRepairWorker } from "@/lib/server/queue";
import { generateId } from "@/lib/db/ids";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; runId: string }>;
}

/** Repair-attempt history for this validation run — the workspace's repair-attempt timeline. */
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, runId } = await params;
  try {
    const attempts = await listRepairAttemptsForRun(getDb(), actor, appId, runId);
    return NextResponse.json({ attempts });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Requests a bounded AI repair attempt against a FAILED validation run.
 * Bounded by `REPAIR_LIMITS.MAX_REPAIR_ATTEMPTS_PER_RUN` (enforced in
 * `enqueueRepairAttempt`, structurally backstopped by a unique DB index) —
 * exceeding it is a 409, not a silently-queued extra attempt. Runs entirely
 * in the durable worker (lib/repair/pipeline.ts); this route only creates
 * the row and nudges the worker.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, runId } = await params;
  const raw = await request.json().catch(() => ({}) as Record<string, unknown>);
  const idempotencyKey = typeof raw.idempotencyKey === "string" && raw.idempotencyKey.length > 0 ? raw.idempotencyKey : generateId();

  try {
    const db = getDb();
    const attempt = await enqueueRepairAttempt(db, actor, appId, { originatingRunId: runId, idempotencyKey });
    await nudgeRepairWorker(attempt.id, { cause: "enqueue" });
    return NextResponse.json({ attempt }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
