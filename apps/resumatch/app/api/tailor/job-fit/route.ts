import { NextResponse } from "next/server";
import { assessJobFit } from "../../../../lib/tailoring/jobFit";
import { getJobmatchDb } from "../../../../lib/db/client";
import { getVersion } from "../../../../lib/profile/versions";
import { getCurrentWorkspace } from "../../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * How well a fetched job fits the confirmed profile (lib/tailoring/jobFit.ts).
 * Called by the tailor flow as soon as a job is in, before any AI is spent,
 * so a low fit can be shown as a warning with an explicit "continue anyway?".
 * Deterministic and free: no provider call, nothing persisted, and it works
 * the same when AI tailoring is unavailable.
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

  const { profileVersionId, targetJobId } = (body ?? {}) as { profileVersionId?: unknown; targetJobId?: unknown };
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

  return NextResponse.json({ fit: assessJobFit(version.content, targetJob.rawText) });
}
