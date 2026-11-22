import { NextResponse } from "next/server";
import { experienceRefOf } from "../../../lib/evidence/contract";
import { evidenceErrorResponse, parseEvidenceWriteBody, readJson } from "../../../lib/evidence/http";
import { createEvidence, listEvidence } from "../../../lib/evidence/store";
import { getConfirmedVersion } from "../../../lib/profile/versions";
import { getCurrentWorkspace } from "../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Background evidence (#929). GET lists the items that apply to one job
 * (its own plus background) and the confirmed profile's roles, so the form
 * can link an item to one. POST adds an item, as a draft unless `confirm`.
 */
export async function GET(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const targetJobId = new URL(request.url).searchParams.get("targetJobId");
  const confirmed = await getConfirmedVersion(workspace.id);
  const profile = confirmed?.content ?? null;
  const items = await listEvidence(workspace.id, targetJobId, profile);
  return NextResponse.json({
    items,
    roles: profile ? profile.experience.map(experienceRefOf) : [],
  });
}

export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const json = await readJson(request);
  if (!json.ok) return json.response;
  const parsed = parseEvidenceWriteBody(json.body);
  if (!parsed.ok) return parsed.response;
  const { input, scope, targetJobId, confirm } = parsed.value;
  const result = await createEvidence(workspace.id, input, { scope, targetJobId, confirm });
  if (!result.ok) return evidenceErrorResponse(result.error);
  return NextResponse.json({ id: result.id, revisionId: result.revisionId }, { status: 201 });
}
