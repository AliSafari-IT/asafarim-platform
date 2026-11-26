import { NextResponse } from "next/server";
import { createEventSchema, parseWith } from "../../../../../lib/applications/timeline/contract";
import { failureResponse, invalid, readBody } from "../../../../../lib/applications/timeline/http";
import { createEvent, loadTimeline } from "../../../../../lib/applications/timeline/service";
import { logError } from "../../../../../lib/observability/logger";
import { getCurrentWorkspace } from "../../../../../lib/workspace";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The application's timeline, oldest first: entries and ResuMatch emails. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const timeline = await loadTimeline(workspace.id, id);
  if (!timeline) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(timeline, { headers: { "cache-control": "private, no-store" } });
}

/** "Add update" (JSON, or multipart with attachments). The same
 *  `clientKey` twice adds one entry. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const read = await readBody(request, { allowFiles: true });
  if (!read.ok) return read.response;
  const parsed = parseWith(createEventSchema, read.body);
  if (!parsed.ok) return invalid(parsed.error, parsed.fields);
  try {
    const result = await createEvent(workspace.id, id, parsed.value, read.files);
    if (!result.ok) return failureResponse(result);
    return NextResponse.json({ ok: true, eventId: result.eventId, replay: result.replay }, { status: result.replay ? 200 : 201 });
  } catch (error) {
    logError("application.event.create_failed", error, { applicationId: id });
    return NextResponse.json({ error: "Could not save the update." }, { status: 500 });
  }
}
