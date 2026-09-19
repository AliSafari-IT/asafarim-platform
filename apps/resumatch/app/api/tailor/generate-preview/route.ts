import { NextResponse } from "next/server";
import { runTailorProviderCall } from "../../../../lib/tailoring/ai/generate";
import { getJobmatchDb } from "../../../../lib/db/client";
import { getVersion } from "../../../../lib/profile/versions";
import { getCurrentWorkspace } from "../../../../lib/workspace";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Step 1 of the proposal-review tailoring flow (issue #429): run the
 * provider call and hand the candidate the raw suggestions to review —
 * nothing is persisted here. `generate-confirm` is the only route that
 * writes a `TailoredResume` row, and only once the candidate has actually
 * seen and approved what it will contain.
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

  const { profileVersionId, targetJobId } = (body ?? {}) as {
    profileVersionId?: unknown;
    targetJobId?: unknown;
  };
  if (typeof profileVersionId !== "string" || typeof targetJobId !== "string") {
    return NextResponse.json({ error: "profileVersionId and targetJobId are required." }, { status: 400 });
  }

  const version = await getVersion(workspace.id, profileVersionId);
  if (!version) return NextResponse.json({ error: "Profile version not found." }, { status: 404 });

  const db = getJobmatchDb();
  const targetJob = await db.targetJob.findFirst({
    where: { id: targetJobId, workspaceId: workspace.id },
    select: { rawText: true, status: true },
  });
  if (!targetJob || targetJob.status !== "FETCHED" || !targetJob.rawText) {
    return NextResponse.json({ error: "That job has no fetched text to tailor toward." }, { status: 400 });
  }

  const profile = version.content;
  const { suggestions, degraded, promptVersion, modelVersion } = await runTailorProviderCall(
    workspace.id,
    targetJobId,
    profile,
    targetJob.rawText,
  );

  return NextResponse.json({
    degraded,
    promptVersion,
    modelVersion,
    suggestions,
    // The candidate's real, unedited values — the review screen falls back
    // to these for anything declined, and needs them to render a
    // before/after comparison at all.
    profile: {
      headline: profile.headline,
      summary: profile.summary,
      skills: profile.skills.map((s) => s.name),
      experience: profile.experience.map((e) => ({
        title: e.title,
        employer: e.employer,
        startedOn: e.startedOn,
        endedOn: e.endedOn,
        isCurrent: e.isCurrent,
        summary: e.summary,
      })),
    },
  });
}
