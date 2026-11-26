import { NextResponse } from "next/server";
import { failureResponse, readBody } from "../../../../../../../lib/applications/timeline/http";
import { addAttachments } from "../../../../../../../lib/applications/timeline/service";
import { logError } from "../../../../../../../lib/observability/logger";
import { getCurrentWorkspace } from "../../../../../../../lib/workspace";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Add screenshots, PDFs or saved emails to an existing entry (multipart,
 *  `file` fields). A file already on the entry is not added again. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const { id, eventId } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const read = await readBody(request, { allowFiles: true });
  if (!read.ok) return read.response;
  if (read.files.length === 0) return NextResponse.json({ error: "A file is required.", code: "NO_FILES" }, { status: 400 });
  try {
    const result = await addAttachments(workspace.id, id, eventId, read.files);
    if (!result.ok) return failureResponse(result);
    return NextResponse.json({ ok: true, added: result.added });
  } catch (error) {
    logError("application.attachment.add_failed", error, { applicationId: id });
    return NextResponse.json({ error: "Could not add the files." }, { status: 500 });
  }
}
