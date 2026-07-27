import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { listReleasesForActor, prepareRelease } from "@/lib/repositories/releases";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/** Release history for the deployment panel — newest first. */
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  try {
    const releases = await listReleasesForActor(getDb(), actor, appId);
    return NextResponse.json({ releases });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Prepares (freezes) a release for an already-persisted specification
 * version. Eligibility is re-derived entirely server-side
 * (lib/deployment/eligibility.ts) — the request body names WHICH version to
 * consider, nothing more; every fact in the frozen manifest comes from
 * already-persisted rows, never from this request.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  const raw = await request.json().catch(() => ({}) as Record<string, unknown>);
  const specificationVersionId = typeof raw.specificationVersionId === "string" ? raw.specificationVersionId : "";
  if (!specificationVersionId) {
    return NextResponse.json({ error: "specificationVersionId is required", code: "invalid_request" }, { status: 400 });
  }

  try {
    const release = await prepareRelease(getDb(), actor, appId, { specificationVersionId });
    return NextResponse.json({ release }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
