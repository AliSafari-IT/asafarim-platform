import { NextResponse } from "next/server";
import { ApplicationNotFoundError, updateApplication } from "../../../../lib/applications/service";
import { APPLICATION_STATUSES } from "../../../../lib/applications/constants";
import { getCurrentWorkspace } from "../../../../lib/workspace";

export const dynamic = "force-dynamic";

/** Scoped to `{ id, workspaceId }` inside `updateApplication` — the id in
 *  the URL cannot reach another candidate's application, whatever value is
 *  passed. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { status, notes, followUpDate, tailoredResumeId } = (body ?? {}) as {
    status?: unknown;
    notes?: unknown;
    followUpDate?: unknown;
    tailoredResumeId?: unknown;
  };

  if (status !== undefined && !APPLICATION_STATUSES.includes(status as (typeof APPLICATION_STATUSES)[number])) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  try {
    const application = await updateApplication(workspace.id, id, {
      status: status as (typeof APPLICATION_STATUSES)[number] | undefined,
      notes: notes === undefined ? undefined : typeof notes === "string" ? notes : null,
      followUpDate:
        followUpDate === undefined ? undefined : typeof followUpDate === "string" ? new Date(followUpDate) : null,
      tailoredResumeId: tailoredResumeId === undefined ? undefined : typeof tailoredResumeId === "string" ? tailoredResumeId : null,
    });
    return NextResponse.json({ application });
  } catch (error) {
    if (error instanceof ApplicationNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
