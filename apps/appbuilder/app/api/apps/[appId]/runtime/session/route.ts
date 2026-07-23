import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { resolveContextForRequest } from "@/lib/generated-data/routeHelpers";
import { listPermittedPageIds } from "@/lib/generated-data/runtimeAuth";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/**
 * The generated app's own "who am I / what can I do" endpoint — every
 * generated-app client bootstraps from this. Returns the trusted
 * membership/roles and the permitted page ids only; never the complete
 * internal specification.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  try {
    const db = getDb();
    const ctx = await resolveContextForRequest(db, actor, appId, request);
    return NextResponse.json({
      principalId: ctx.actor.principalId,
      roleIds: ctx.roleIds,
      simulated: ctx.simulated,
      specVersionNumber: ctx.specVersionNumber,
      permittedPageIds: listPermittedPageIds(ctx),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
