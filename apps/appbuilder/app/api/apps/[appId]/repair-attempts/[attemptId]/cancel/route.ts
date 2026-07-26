import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { requestCancellation } from "@/lib/repositories/repairAttempts";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; attemptId: string }>;
}

/** Requests cancellation of an active repair attempt — idempotent; a terminal attempt cannot be cancelled (409). No repairs proceed after cancellation (checked at every phase boundary in lib/repair/pipeline.ts). */
export async function POST(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, attemptId } = await params;
  try {
    const attempt = await requestCancellation(getDb(), actor, appId, attemptId);
    return NextResponse.json({ attempt });
  } catch (err) {
    return errorResponse(err);
  }
}
