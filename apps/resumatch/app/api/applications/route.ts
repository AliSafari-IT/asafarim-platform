import { NextResponse } from "next/server";
import { ApplicationNotFoundError, createApplication, listApplications } from "../../../lib/applications/service";
import { getCurrentWorkspace } from "../../../lib/workspace";

export const dynamic = "force-dynamic";

export async function GET() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const applications = await listApplications(workspace.id);
  return NextResponse.json({ applications });
}

export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { targetJobId, tailoredResumeId, notes } = (body ?? {}) as {
    targetJobId?: unknown;
    tailoredResumeId?: unknown;
    notes?: unknown;
  };
  if (typeof targetJobId !== "string") {
    return NextResponse.json({ error: "targetJobId is required." }, { status: 400 });
  }

  try {
    const application = await createApplication(workspace.id, {
      targetJobId,
      tailoredResumeId: typeof tailoredResumeId === "string" ? tailoredResumeId : null,
      notes: typeof notes === "string" ? notes : null,
    });
    return NextResponse.json({ application });
  } catch (error) {
    if (error instanceof ApplicationNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
