import { NextResponse } from "next/server";
import { runCoverLetterProviderCall } from "../../../../../lib/tailoring/ai/coverLetter/generate";
import { getJobmatchDb } from "../../../../../lib/db/client";
import { getVersion } from "../../../../../lib/profile/versions";
import { buildProfileText } from "../../../../../lib/tailoring/buildProfileText";
import { getCurrentWorkspace } from "../../../../../lib/workspace";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cover-letter generation (issue #430, part of #453). Runs the provider
 * call and returns the suggestion for review — nothing is persisted here.
 * Mirrors `generate-preview`'s "review before anything is written" shape
 * (#429); a persisted `CoverLetter` row and its own confirm step are #454's
 * scope, once a review UI exists to actually show this to the candidate.
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
    return NextResponse.json({ error: "That job has no fetched text to write toward." }, { status: 400 });
  }

  const { text: profileText } = buildProfileText(version.content);
  const { suggestion, degraded, promptVersion, modelVersion } = await runCoverLetterProviderCall(
    workspace.id,
    targetJobId,
    profileText,
    targetJob.rawText,
  );

  return NextResponse.json({ degraded, promptVersion, modelVersion, suggestion });
}
