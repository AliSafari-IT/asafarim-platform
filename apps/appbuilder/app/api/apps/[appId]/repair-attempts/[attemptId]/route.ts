import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getRepairAttemptForActor } from "@/lib/repositories/repairAttempts";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; attemptId: string }>;
}

/** Polled by the workspace's repair-attempt timeline for truthful progress and the destructive-confirmation prompt. */
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, attemptId } = await params;
  try {
    const attempt = await getRepairAttemptForActor(getDb(), actor, appId, attemptId);
    return NextResponse.json({ attempt });
  } catch (err) {
    return errorResponse(err);
  }
}
