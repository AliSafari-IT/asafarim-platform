import { NextResponse } from "next/server";
import { evidenceErrorResponse, readJson } from "../../../../../lib/evidence/http";
import { confirmEvidence } from "../../../../../lib/evidence/store";
import { getCurrentWorkspace } from "../../../../../lib/workspace";

export const dynamic = "force-dynamic";

/** Confirms the revision the candidate reviewed. Only confirmed evidence
 *  can reach generation. Idempotent. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const { id } = await params;
  const json = await readJson(request);
  if (!json.ok) return json.response;
  const revisionId = (json.body as { revisionId?: unknown } | null)?.revisionId;
  if (typeof revisionId !== "string") {
    return NextResponse.json({ error: "revisionId is required.", code: "EVIDENCE_INVALID", field: "revisionId" }, { status: 400 });
  }
  const result = await confirmEvidence(workspace.id, id, revisionId);
  if (!result.ok) return evidenceErrorResponse(result.error);
  return NextResponse.json({ id: result.id, revisionId: result.revisionId });
}
