import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getReleaseForActor } from "@/lib/repositories/releases";
import { composeManifestView } from "@/lib/deployment/manifest";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; releaseId: string }>;
}

/** A single release's full provenance view — the frozen manifest plus its current status/approval/publish facts, for the deployment panel's "exact version/checksum being approved" surface. */
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, releaseId } = await params;
  try {
    const release = await getReleaseForActor(getDb(), actor, appId, releaseId);
    return NextResponse.json({ release, manifest: composeManifestView(release) });
  } catch (err) {
    return errorResponse(err);
  }
}
