import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { compareVersionsForActor } from "@/lib/repositories/specifications";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/** Structured diff between two immutable versions — `?from=N&to=M` query params. */
export async function GET(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  const url = new URL(request.url);
  const from = Number.parseInt(url.searchParams.get("from") ?? "", 10);
  const to = Number.parseInt(url.searchParams.get("to") ?? "", 10);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0) {
    return NextResponse.json({ error: "Query parameters 'from' and 'to' must be non-negative integers." }, { status: 400 });
  }

  try {
    const diff = await compareVersionsForActor(getDb(), actor, appId, from, to);
    return NextResponse.json({ diff });
  } catch (err) {
    return errorResponse(err);
  }
}
