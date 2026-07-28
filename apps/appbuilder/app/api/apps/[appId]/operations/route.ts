import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { buildAppReadinessSnapshot } from "@/lib/observability/readiness";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/**
 * The single M12 launch-readiness aggregation endpoint. Returns REAL
 * persisted status only — see lib/observability/readiness.ts's docstring —
 * and trims the response server-side for a viewer role rather than relying
 * on the client to hide fields (see `restricted`/nulled sections in the
 * response). An unrelated actor gets the same 404 every other app-scoped
 * route returns, via `assertCapability` inside `buildAppReadinessSnapshot`.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  try {
    const snapshot = await buildAppReadinessSnapshot(getDb(), actor, appId);
    return NextResponse.json({ snapshot });
  } catch (err) {
    return errorResponse(err);
  }
}
