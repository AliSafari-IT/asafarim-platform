import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getVersionForActor } from "@/lib/repositories/specifications";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; versionNumber: string }>;
}

/** A single immutable specification version, by its version number — for inspecting a historical version. */
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, versionNumber } = await params;
  const parsed = Number.parseInt(versionNumber, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return NextResponse.json({ error: "Invalid version number." }, { status: 400 });
  }

  try {
    const version = await getVersionForActor(getDb(), actor, appId, parsed);
    return NextResponse.json({ version });
  } catch (err) {
    return errorResponse(err);
  }
}
