import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getGenerationJobForActor, listOperationBatchesForActor } from "@/lib/repositories/generationJobs";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; jobId: string }>;
}

/**
 * Polled by the app detail page's status panel. Returns the job row plus
 * its per-iteration operation-batch summaries — everything the UI needs to
 * render truthful progress without exposing raw provider payloads or
 * secrets (the job row itself never carries those; see
 * lib/generation/errors.ts and @asafarim/appbuilder-ai's redact.ts).
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, jobId } = await params;
  try {
    const db = getDb();
    const [job, batches] = await Promise.all([
      getGenerationJobForActor(db, actor, appId, jobId),
      listOperationBatchesForActor(db, actor, appId, jobId),
    ]);
    return NextResponse.json({ job, batches });
  } catch (err) {
    return errorResponse(err);
  }
}
