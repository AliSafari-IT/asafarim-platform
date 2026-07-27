import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { approveRelease } from "@/lib/repositories/releases";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; releaseId: string }>;
}

/**
 * Approves a draft release, binding approval to its EXACT frozen version and
 * checksum. Requires `app.approve` (distinct from `app.deployRelease`) —
 * approving and deploying are separate actor actions even though both are
 * currently owner-rank. Eligibility is re-checked fresh; a release that was
 * eligible at preparation time but no longer is (its validation run was
 * superseded, its preview build invalidated, the app archived) is refused
 * with a stale-approval error rather than rubber-stamped.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, releaseId } = await params;
  try {
    const release = await approveRelease(getDb(), actor, appId, releaseId);
    return NextResponse.json({ release });
  } catch (err) {
    return errorResponse(err);
  }
}
