import { NextResponse } from "next/server";
import { getCurrentWorkspace } from "../../../../../lib/workspace";
import { parseDraftUpdate } from "../../../../../lib/tailoring/drafts/contract";
import { discardDraft, saveDraft } from "../../../../../lib/tailoring/drafts/store";

export const dynamic = "force-dynamic";

/**
 * One job's Tailor draft (lib/tailoring/drafts). The page saves the
 * options card and the review here as the candidate works; resuming reads
 * it server-side on /tailor, so there is no GET.
 *
 * - PUT `{ step, options, previewId, review }`: replaces the saved progress.
 *   404 for a job outside this workspace (or one with no text), 409 when a
 *   review names a preview that is used or gone.
 * - DELETE: "Discard". The draft goes; the job row stays.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ targetJobId: string }> }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const update = parseDraftUpdate(body);
  if (!update.ok) return NextResponse.json({ error: update.error }, { status: 400 });

  const { targetJobId } = await params;
  const result = await saveDraft(workspace.id, targetJobId, update.value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ updatedAt: result.updatedAt });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ targetJobId: string }> }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const { targetJobId } = await params;
  const deleted = await discardDraft(workspace.id, targetJobId);
  return NextResponse.json({ deleted });
}
