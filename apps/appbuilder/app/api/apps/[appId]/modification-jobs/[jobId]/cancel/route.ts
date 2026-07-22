import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { requestCancellation } from "@/lib/repositories/modificationJobs";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; jobId: string }>;
}

/** Requests cancellation of an active modification job. Idempotent and repeatable, mirrors generation-jobs/[jobId]/cancel. */
export async function POST(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, jobId } = await params;
  try {
    const job = await requestCancellation(getDb(), actor, appId, jobId);
    return NextResponse.json({ job });
  } catch (err) {
    return errorResponse(err);
  }
}
