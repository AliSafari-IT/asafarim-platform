import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getSpecificationForActor, getLatestVersionForActor } from "@/lib/repositories/specifications";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/**
 * The current specification container plus its latest version's full
 * payload — what the workspace's structure panel (pages/entities/fields/
 * relations/roles/workflows/branding) reads to render persisted structure.
 * Selecting an item in that panel only ever reads from this response; it
 * never mutates the specification directly (all mutation goes through the
 * conversational modification pipeline or an explicit restore/undo).
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  try {
    const db = getDb();
    const [specification, latestVersion] = await Promise.all([
      getSpecificationForActor(db, actor, appId),
      getLatestVersionForActor(db, actor, appId),
    ]);
    return NextResponse.json({ specification, latestVersion: latestVersion ?? null });
  } catch (err) {
    return errorResponse(err);
  }
}
