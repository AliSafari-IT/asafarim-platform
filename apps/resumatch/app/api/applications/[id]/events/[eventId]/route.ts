import { NextResponse } from "next/server";
import { parseWith, updateEventSchema } from "../../../../../../lib/applications/timeline/contract";
import { failureResponse, invalid, readBody } from "../../../../../../lib/applications/timeline/http";
import { deleteEvent, updateEvent } from "../../../../../../lib/applications/timeline/service";
import { logError } from "../../../../../../lib/observability/logger";
import { getCurrentWorkspace } from "../../../../../../lib/workspace";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; eventId: string }> };

/** Correct a timeline entry. The recorded submission is edited with
 *  PATCH /submission instead (409 here). */
export async function PATCH(request: Request, { params }: Params) {
  const { id, eventId } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const read = await readBody(request, { allowFiles: false });
  if (!read.ok) return read.response;
  const parsed = parseWith(updateEventSchema, read.body);
  if (!parsed.ok) return invalid(parsed.error, parsed.fields);
  try {
    const result = await updateEvent(workspace.id, id, eventId, parsed.value);
    if (!result.ok) return failureResponse(result);
    return NextResponse.json({ ok: true });
  } catch (error) {
    logError("application.event.update_failed", error, { applicationId: id });
    return NextResponse.json({ error: "Could not save the change." }, { status: 500 });
  }
}

/** Delete an entry and its attachments; the status stays as it is. */
export async function DELETE(_request: Request, { params }: Params) {
  const { id, eventId } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  try {
    const result = await deleteEvent(workspace.id, id, eventId);
    if (!result.ok) return failureResponse(result);
    return NextResponse.json({ ok: true });
  } catch (error) {
    logError("application.event.delete_failed", error, { applicationId: id });
    return NextResponse.json({ error: "Could not delete it." }, { status: 500 });
  }
}
