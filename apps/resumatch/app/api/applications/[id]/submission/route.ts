import { NextResponse } from "next/server";
import { editSubmissionSchema, parseWith, recordSubmissionSchema } from "../../../../../lib/applications/timeline/contract";
import { failureResponse, invalid, readBody } from "../../../../../lib/applications/timeline/http";
import { editExternalSubmission, recordExternalSubmission, undoExternalSubmission } from "../../../../../lib/applications/timeline/service";
import { logError } from "../../../../../lib/observability/logger";
import { getCurrentWorkspace } from "../../../../../lib/workspace";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * An application submitted outside ResuMatch (application-timeline.md).
 *
 * - POST records it (JSON, or multipart with confirmation files): Saved
 *   becomes Applied, no email record is written. A repeated POST with the
 *   same `clientKey` changes nothing; a second recording is a 409.
 * - PATCH edits the recorded details; a later status is never moved back.
 * - DELETE undoes it, leaving the job, documents, emails and other entries.
 *
 * Scoped to `{ id, workspaceId }` in the service; another candidate's id is
 * a 404.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const read = await readBody(request, { allowFiles: true });
  if (!read.ok) return read.response;
  const parsed = parseWith(recordSubmissionSchema(), read.body);
  if (!parsed.ok) return invalid(parsed.error, parsed.fields);
  try {
    const result = await recordExternalSubmission(workspace.id, id, parsed.value, read.files);
    if (!result.ok) return failureResponse(result);
    return NextResponse.json({ ok: true, replay: result.replay }, { status: result.replay ? 200 : 201 });
  } catch (error) {
    logError("application.submission.record_failed", error, { applicationId: id });
    return NextResponse.json({ error: "Could not record the application." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const read = await readBody(request, { allowFiles: false });
  if (!read.ok) return read.response;
  const parsed = parseWith(editSubmissionSchema(), read.body);
  if (!parsed.ok) return invalid(parsed.error, parsed.fields);
  try {
    const result = await editExternalSubmission(workspace.id, id, parsed.value);
    if (!result.ok) return failureResponse(result);
    return NextResponse.json({ ok: true });
  } catch (error) {
    logError("application.submission.edit_failed", error, { applicationId: id });
    return NextResponse.json({ error: "Could not save the change." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  try {
    const result = await undoExternalSubmission(workspace.id, id);
    if (!result.ok) return failureResponse(result);
    return NextResponse.json({ ok: true, status: result.status });
  } catch (error) {
    logError("application.submission.undo_failed", error, { applicationId: id });
    return NextResponse.json({ error: "Could not undo it." }, { status: 500 });
  }
}
