import { NextResponse } from "next/server";
import { getJobmatchDb } from "../../../../lib/db/client";
import { createApplication } from "../../../../lib/applications/service";
import { getCurrentWorkspace } from "../../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * The application for one tailored CV: the existing one, or a new Saved one.
 * Used by "Send application" on the CV and cover-letter pages, which may
 * come before the candidate ever saved the job to the tracker. Creating the
 * row is not a status change; nothing here ever touches `status`.
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
  const tailoredResumeId = (body as { tailoredResumeId?: unknown } | null)?.tailoredResumeId;
  if (typeof tailoredResumeId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(tailoredResumeId)) {
    return NextResponse.json({ error: "tailoredResumeId is required." }, { status: 400 });
  }

  const db = getJobmatchDb();
  const resume = await db.tailoredResume.findFirst({
    where: { id: tailoredResumeId, workspaceId: workspace.id },
    select: { id: true, targetJobId: true },
  });
  if (!resume) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing = await db.application.findFirst({
    where: { workspaceId: workspace.id, tailoredResumeId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  if (existing) return NextResponse.json({ applicationId: existing.id, created: false });

  const application = await createApplication(workspace.id, { targetJobId: resume.targetJobId, tailoredResumeId });
  return NextResponse.json({ applicationId: application.id, created: true });
}
