import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getModificationJobForActor, getOperationBatchForActor } from "@/lib/repositories/modificationJobs";
import { getPlanById, getPlanStepById, getPlanSteps } from "@/lib/repositories/modificationPlans";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; jobId: string }>;
}

/**
 * Polled by the workspace's conversation panel — the job row (including its
 * `clarificationState`, when awaiting one) plus its proposed operation
 * batch, for rendering truthful progress, the diff/confirmation UI, and
 * (M13 slice E) the pending clarification question or the multi-step plan
 * this job's step belongs to.
 */
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

    // getModificationJobForActor already proved this actor may view this
    // app's conversation; the appId equality checks below are defense in
    // depth against a plan/step row somehow pointing cross-app.
    let plan: { plan: Awaited<ReturnType<typeof getPlanById>>; steps: Awaited<ReturnType<typeof getPlanSteps>> } | null = null;
    if (job.planStepId) {
      const step = await getPlanStepById(db, job.planStepId);
      if (step && step.appId === appId) {
        const [planRow, steps] = await Promise.all([getPlanById(db, step.planId), getPlanSteps(db, step.planId)]);
        if (planRow && planRow.appId === appId) plan = { plan: planRow, steps };
      }
    }

    return NextResponse.json({ job, batch, plan });
  } catch (err) {
    return errorResponse(err);
  }
}
