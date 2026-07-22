import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { listVersionsForActor } from "@/lib/repositories/specifications";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/** Full immutable version history, oldest first — the workspace's version-history panel. */
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  try {
    const versions = await listVersionsForActor(getDb(), actor, appId);
    return NextResponse.json({ versions });
  } catch (err) {
    return errorResponse(err);
  }
}
