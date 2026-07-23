import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { resolveContextForRequest } from "@/lib/generated-data/routeHelpers";
import { listRecords } from "@/lib/generated-data/query";
import { createRecord } from "@/lib/generated-data/records";
import { RecordDataBody, ListQuerySchema } from "@/lib/validation/runtime";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; entityId: string }>;
}

/** Bounded, app+entity-scoped record listing — pagination/filter/sort/search, never arbitrary SQL/JSONPath. */
export async function GET(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, entityId } = await params;
  const url = new URL(request.url);
  const parsed = ListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters." }, { status: 400 });
  }

  try {
    const db = getDb();
    const ctx = await resolveContextForRequest(db, actor, appId, request);
    const result = await listRecords(db, ctx, entityId, {
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      sortFieldId: parsed.data.sortFieldId,
      sortDirection: parsed.data.sortDirection,
      search: parsed.data.search,
      includeArchived: parsed.data.includeArchived,
      filters: parsed.data.filters,
    });
    return NextResponse.json({ ...result, simulated: ctx.simulated });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Typed, validated record creation — idempotent per client-supplied key. */
export async function POST(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, entityId } = await params;
  const raw = await request.json().catch(() => null);
  const parsed = RecordDataBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid record payload." }, { status: 400 });
  }

  try {
    const db = getDb();
    const ctx = await resolveContextForRequest(db, actor, appId, request);
    const record = await createRecord(db, ctx, entityId, parsed.data.data, parsed.data.idempotencyKey ?? randomUUID());
    return NextResponse.json({ record, simulated: ctx.simulated }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
