import { NextResponse } from "next/server";
import { evidenceErrorResponse, parseEvidenceWriteBody, readJson } from "../../../../lib/evidence/http";
import { deleteEvidence, evidenceDeletionImpact, reviseEvidence } from "../../../../lib/evidence/store";
import { getCurrentWorkspace } from "../../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * PUT saves an edit on top of `baseRevisionId` (409 EVIDENCE_STALE when the
 * item changed since). Changed text adds a revision; earlier revisions, and
 * the CVs that used them, stay as they were. DELETE removes the item,
 * the previews made with it and the review feedback of CVs that used it
 * (#933); GET says how many of those there are, so the candidate is told
 * before confirming.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const { id } = await params;
  const impact = await evidenceDeletionImpact(workspace.id, id);
  if (!impact) return evidenceErrorResponse("not_found");
  return NextResponse.json({ impact });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const { id } = await params;
  const json = await readJson(request);
  if (!json.ok) return json.response;
  const baseRevisionId = (json.body as { baseRevisionId?: unknown } | null)?.baseRevisionId;
  if (typeof baseRevisionId !== "string") {
    return NextResponse.json({ error: "baseRevisionId is required.", code: "EVIDENCE_INVALID", field: "baseRevisionId" }, { status: 400 });
  }
  const parsed = parseEvidenceWriteBody(json.body);
  if (!parsed.ok) return parsed.response;
  const { input, scope, targetJobId, confirm } = parsed.value;
  const result = await reviseEvidence(workspace.id, id, baseRevisionId, input, { scope, targetJobId, confirm });
  if (!result.ok) return evidenceErrorResponse(result.error);
  return NextResponse.json({ id: result.id, revisionId: result.revisionId });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const { id } = await params;
  const result = await deleteEvidence(workspace.id, id);
  if (!result) return evidenceErrorResponse("not_found");
  return NextResponse.json({ deleted: true, ...result });
}
