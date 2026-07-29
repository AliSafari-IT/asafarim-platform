import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getLatestModificationJobForActor } from "@/lib/repositories/modificationJobs";
import { getPlanById, getPlanStepById, getPlanSteps } from "@/lib/repositories/modificationPlans";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/**
 * Latest modification job for this app (any status), or `null` if none was
 * ever requested — polled by the workspace to reconnect to an active job
 * after refresh, tab close/reopen, or a device switch (persisted state is
 * authoritative, never browser-only state). `job.clarificationState` (M13
 * slice E) is included on the row itself; `plan` is resolved separately
 * only when this job's step belongs to one, same shape/appId-scoping as
 * `modification-jobs/[jobId]/route.ts`'s own plan lookup.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  try {
    const db = getDb();
    const job = await getLatestModificationJobForActor(db, actor, appId);

    let plan: { plan: Awaited<ReturnType<typeof getPlanById>>; steps: Awaited<ReturnType<typeof getPlanSteps>> } | null = null;
    if (job?.planStepId) {
      const step = await getPlanStepById(db, job.planStepId);
      if (step && step.appId === appId) {
        const [planRow, steps] = await Promise.all([getPlanById(db, step.planId), getPlanSteps(db, step.planId)]);
        if (planRow && planRow.appId === appId) plan = { plan: planRow, steps };
      }
    }

    return NextResponse.json({ job, plan });
  } catch (err) {
    return errorResponse(err);
  }
}
