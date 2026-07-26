import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { resolveContextForRequest } from "@/lib/generated-data/routeHelpers";
import { getRecord, updateRecord } from "@/lib/generated-data/records";
import { UpdateRecordBody } from "@/lib/validation/runtime";
import { errorResponse, unauthorized } from "@/lib/http/errors";
import { checksumOf } from "@/lib/db/hash";

interface RouteParams {
  params: Promise<{ appId: string; entityId: string; recordId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, entityId, recordId } = await params;
  try {
    const db = getDb();
    const ctx = await resolveContextForRequest(db, actor, appId, request);
    const record = await getRecord(db, ctx, entityId, recordId);
    return NextResponse.json({ record, simulated: ctx.simulated });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Optimistic-concurrency update — a stale `baseRevision` fails without overwriting newer data. */
export async function PATCH(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, entityId, recordId } = await params;
  const raw = await request.json().catch(() => null);
  const parsed = UpdateRecordBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update payload." }, { status: 400 });
  }

  try {
    const db = getDb();
    const ctx = await resolveContextForRequest(db, actor, appId, request);
    // Content-derived, not just `${recordId}:${baseRevision}` — two
    // DIFFERENT edits submitted against the same base revision (the exact
    // concurrent-edit collision this endpoint exists to detect) must reach
    // updateRecord's real revision check and surface as StaleRecordRevisionError,
    // not collide on a shared key and get swallowed as a generic conflict
    // by the idempotency layer. A genuine retry of the SAME payload still
    // replays idempotently, since the hash is identical.
    const idempotencyKey =
      parsed.data.idempotencyKey ?? checksumOf({ recordId, baseRevision: parsed.data.baseRevision, data: parsed.data.data });
    const record = await updateRecord(db, ctx, entityId, recordId, {
      data: parsed.data.data,
      baseRevision: parsed.data.baseRevision,
      idempotencyKey,
    });
    return NextResponse.json({ record, simulated: ctx.simulated });
  } catch (err) {
    return errorResponse(err);
  }
}
