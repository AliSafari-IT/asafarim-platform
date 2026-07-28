import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import {
  cancelCustomDomainRequest,
  createCustomDomainRequest,
  getCustomDomainRequestForActor,
} from "@/lib/customDomains/requests";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/** Latest custom-domain readiness request for this app, if any — see lib/customDomains/requests.ts. */
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  try {
    const request = await getCustomDomainRequestForActor(getDb(), actor, appId);
    return NextResponse.json({ request });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Records a custom-domain readiness request. Never provisions DNS, issues a
 * TLS certificate, or changes routing — see lib/customDomains/featureFlag.ts.
 * The caller must pass `acknowledgeNotEnabled: true` while the platform
 * flag is off, so the UI is the one place this is explained, not a silent
 * client assumption.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  const raw = await request.json().catch(() => ({}) as Record<string, unknown>);
  const requestedHost =
    typeof raw.requestedHost === "string" ? raw.requestedHost : "";
  const acknowledgeNotEnabled = raw.acknowledgeNotEnabled === true;
  if (!requestedHost) {
    return NextResponse.json(
      { error: "requestedHost is required", code: "invalid_request" },
      { status: 400 }
    );
  }

  try {
    const domainRequest = await createCustomDomainRequest(
      getDb(),
      actor,
      appId,
      { requestedHost, acknowledgeNotEnabled }
    );
    return NextResponse.json({ request: domainRequest }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  const raw = await request.json().catch(() => ({}) as Record<string, unknown>);
  const requestId = typeof raw.requestId === "string" ? raw.requestId : "";
  if (!requestId) {
    return NextResponse.json(
      { error: "requestId is required", code: "invalid_request" },
      { status: 400 }
    );
  }

  try {
    const cancelled = await cancelCustomDomainRequest(
      getDb(),
      actor,
      appId,
      requestId
    );
    return NextResponse.json({ request: cancelled });
  } catch (err) {
    return errorResponse(err);
  }
}
