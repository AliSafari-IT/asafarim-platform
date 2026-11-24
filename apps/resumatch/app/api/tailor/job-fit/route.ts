import { NextResponse } from "next/server";
import { assessJobFit } from "../../../../lib/tailoring/jobFit";
import { getJobmatchDb } from "../../../../lib/db/client";
import { getVersion } from "../../../../lib/profile/versions";
import { loadGenerationEvidence } from "../../../../lib/evidence/store";
import { extractRequirements } from "../../../../lib/tailoring/selection/requirements";
import {
  clarificationQuestions,
  parseUnmetRequirementIds,
  evidenceRelevanceForJob,
  selectTailoringInputs,
} from "../../../../lib/tailoring/selection/select";
import { getCurrentWorkspace } from "../../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * How well a fetched job fits the confirmed profile (lib/tailoring/jobFit.ts).
 * Called by the tailor flow as soon as a job is in, before any AI is spent,
 * so a low fit can be shown as a warning with an explicit "continue anyway?".
 * Deterministic and free: no provider call, nothing persisted, and it works
 * the same when AI tailoring is unavailable.
 *
 * #930: it also lists the job's requirements, each marked supported,
 * unknown, unmet or conflict against the profile and confirmed evidence,
 * and up to three optional clarification questions for unknown ones.
 * `unmetRequirementIds` are the candidate's "no" answers so far.
 */
export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { profileVersionId, targetJobId, unmetRequirementIds } = (body ?? {}) as {
    profileVersionId?: unknown;
    targetJobId?: unknown;
    unmetRequirementIds?: unknown;
  };
  if (typeof profileVersionId !== "string" || typeof targetJobId !== "string") {
    return NextResponse.json({ error: "profileVersionId and targetJobId are required." }, { status: 400 });
  }

  const version = await getVersion(workspace.id, profileVersionId);
  if (!version) return NextResponse.json({ error: "Profile version not found." }, { status: 404 });

  const targetJob = await getJobmatchDb().targetJob.findFirst({
    where: { id: targetJobId, workspaceId: workspace.id },
    select: { rawText: true, status: true },
  });
  if (!targetJob || targetJob.status !== "FETCHED" || !targetJob.rawText) {
    return NextResponse.json({ error: "That job has no fetched text to compare." }, { status: 400 });
  }

  const requirements = extractRequirements(targetJob.rawText);
  const unmet = parseUnmetRequirementIds(unmetRequirementIds, requirements);
  if (unmet === null) return NextResponse.json({ error: "Invalid unmetRequirementIds." }, { status: 400 });
  const relevance = evidenceRelevanceForJob(targetJob.rawText);
  const evidence = await loadGenerationEvidence(workspace.id, targetJobId, version.content, relevance);
  const selection = selectTailoringInputs({
    profile: version.content,
    jobText: targetJob.rawText,
    evidence,
    unmetRequirementIds: unmet,
  });

  return NextResponse.json({
    fit: assessJobFit(version.content, targetJob.rawText),
    requirements: selection.coverage,
    questions: clarificationQuestions(selection.coverage),
  });
}
