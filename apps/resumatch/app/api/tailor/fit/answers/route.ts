import { NextResponse } from "next/server";
import { getJobmatchDb } from "../../../../../lib/db/client";
import { fitState, knownRequirementIds, loadFitContext, refreshStoredScore } from "../../../../../lib/tailoring/fit/service";
import { getCurrentWorkspace, recordAuditEvent } from "../../../../../lib/workspace";
import { contextOrError, isId, readBody } from "../http";

export const dynamic = "force-dynamic";

/**
 * A clarification answer (#971). "no" marks the requirement unmet by the
 * candidate's word. "yes" needs the confirmed evidence revision that holds
 * the candidate's own words (saved through /api/evidence after their
 * second confirm): an unconfirmed or foreign revision is refused. DELETE
 * undoes the latest answer. The same assessment is rescored at once, with
 * no AI call.
 */

async function respond(workspaceId: string, targetJobId: string, profileVersionId: string) {
  const reloaded = await loadFitContext(workspaceId, targetJobId, profileVersionId);
  if (!reloaded.ok) return NextResponse.json({ error: "Not found." }, { status: 404 });
  await refreshStoredScore(reloaded.context);
  return NextResponse.json(await fitState(reloaded.context));
}

export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  const loaded = await contextOrError(workspace.id, body.targetJobId, body.profileVersionId);
  if ("response" in loaded) return loaded.response;
  const { context } = loaded;
  const { requirementId, answer, evidenceRevisionId } = body;
  if (!isId(requirementId) || !(await knownRequirementIds(context)).has(requirementId)) {
    return NextResponse.json({ error: "Unknown requirement." }, { status: 400 });
  }
  if (answer !== "yes" && answer !== "no") return NextResponse.json({ error: "answer must be yes or no." }, { status: 400 });
  const db = getJobmatchDb();
  if (answer === "yes") {
    if (!isId(evidenceRevisionId)) return NextResponse.json({ error: "A yes needs confirmed evidence." }, { status: 400 });
    const revision = await db.candidateEvidenceRevision.findFirst({
      where: { id: evidenceRevisionId, workspaceId: workspace.id, status: "CONFIRMED" },
      select: { evidence: { select: { scope: true, targetJobId: true } } },
    });
    if (!revision || (revision.evidence.scope === "APPLICATION" && revision.evidence.targetJobId !== context.targetJobId)) {
      return NextResponse.json({ error: "That evidence is not confirmed for this job." }, { status: 400 });
    }
  }
  await db.jobFitAnswer.create({
    data: {
      workspaceId: workspace.id,
      targetJobId: context.targetJobId,
      requirementId,
      answer,
      evidenceRevisionId: answer === "yes" ? (evidenceRevisionId as string) : null,
    },
  });
  await recordAuditEvent(workspace.id, "tailoring.fit_answered", { targetJobId: context.targetJobId, answer });
  return respond(workspace.id, context.targetJobId, context.version.id);
}

export async function DELETE(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  const loaded = await contextOrError(workspace.id, body.targetJobId, body.profileVersionId);
  if ("response" in loaded) return loaded.response;
  if (!isId(body.requirementId)) return NextResponse.json({ error: "Unknown requirement." }, { status: 400 });
  await getJobmatchDb().jobFitAnswer.updateMany({
    where: { workspaceId: workspace.id, targetJobId: loaded.context.targetJobId, requirementId: body.requirementId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return respond(workspace.id, loaded.context.targetJobId, loaded.context.version.id);
}
