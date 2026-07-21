import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getAppForActor } from "@/lib/repositories/apps";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/**
 * Owner/collaborator-scoped app read. An app that exists but the actor
 * can't access returns the same 404 as one that doesn't exist — see
 * lib/repositories/authz.ts#assertCapability.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  try {
    const app = await getAppForActor(getDb(), actor, appId);
    return NextResponse.json({ app });
  } catch (err) {
    return errorResponse(err);
  }
}
