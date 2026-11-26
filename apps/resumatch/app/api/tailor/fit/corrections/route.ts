import { NextResponse } from "next/server";
import { getJobmatchDb } from "../../../../../lib/db/client";
import { isFitPriority } from "../../../../../lib/tailoring/fit/contract";
import { fitState, knownRequirementIds, loadFitContext, refreshStoredScore } from "../../../../../lib/tailoring/fit/service";
import { getCurrentWorkspace, recordAuditEvent } from "../../../../../lib/workspace";
import { contextOrError, isId, readBody } from "../http";

export const dynamic = "force-dynamic";

/**
 * Correct a misread job requirement (#971): a different priority, "not a
 * requirement", or "restore" the analysis' reading. Append-only, so the
 * original reading and every change stay on record.
 */
export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  const loaded = await contextOrError(workspace.id, body.targetJobId, body.profileVersionId);
  if ("response" in loaded) return loaded.response;
  const { context } = loaded;
  const { requirementId, action, priority } = body;
  if (!isId(requirementId) || !(await knownRequirementIds(context)).has(requirementId)) {
    return NextResponse.json({ error: "Unknown requirement." }, { status: 400 });
  }
  if (action !== "priority" && action !== "not_requirement" && action !== "restore") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }
  if (action === "priority" && !isFitPriority(priority)) return NextResponse.json({ error: "Invalid priority." }, { status: 400 });
  await getJobmatchDb().jobFitCorrection.create({
    data: {
      workspaceId: workspace.id,
      targetJobId: context.targetJobId,
      requirementId,
      action,
      priority: action === "priority" ? (priority as string) : null,
    },
  });
  await recordAuditEvent(workspace.id, "tailoring.fit_corrected", { targetJobId: context.targetJobId, action });
  const reloaded = await loadFitContext(workspace.id, context.targetJobId, context.version.id);
  if (!reloaded.ok) return NextResponse.json({ error: "Not found." }, { status: 404 });
  await refreshStoredScore(reloaded.context);
  return NextResponse.json(await fitState(reloaded.context));
}
