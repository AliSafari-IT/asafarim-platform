import { NextResponse } from "next/server";
import { ApplicationNotFoundError, updateApplication } from "../../../../lib/applications/service";
import { parseApplicationPatch } from "../../../../lib/applications/patch";
import { logError } from "../../../../lib/observability/logger";
import { getCurrentWorkspace } from "../../../../lib/workspace";

export const dynamic = "force-dynamic";

/** Scoped to `{ id, workspaceId }` inside `updateApplication` — the id in
 *  the URL cannot reach another candidate's application, whatever value is
 *  passed. The body is validated in full by `parseApplicationPatch` before
 *  the service runs, so a malformed request writes nothing (issue #895).
 *
 *  Every error is JSON with an `error` string so the client can always tell
 *  a failed save from a successful one; no response or log line carries the
 *  submitted note text. */
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

  const parsed = parseApplicationPatch(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error, fields: parsed.fields }, { status: 400 });
  }

  try {
    const application = await updateApplication(workspace.id, id, parsed.patch);
    return NextResponse.json({ application });
  } catch (error) {
    if (error instanceof ApplicationNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    logError("application.update.failed", error, { applicationId: id });
    return NextResponse.json({ error: "Could not save the change." }, { status: 500 });
  }
}
