import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getModificationJobForActor, getOperationBatchForActor } from "@/lib/repositories/modificationJobs";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; jobId: string }>;
}

/** Polled by the workspace's conversation panel — the job row plus its (single) proposed operation batch, for rendering truthful progress and the diff/confirmation UI. */
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, jobId } = await params;
  try {
    const db = getDb();
    const [job, batch] = await Promise.all([
      getModificationJobForActor(db, actor, appId, jobId),
      getOperationBatchForActor(db, actor, appId, jobId),
    ]);
    return NextResponse.json({ job, batch });
  } catch (err) {
    return errorResponse(err);
  }
}
