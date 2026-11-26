import { NextResponse } from "next/server";
import { getEnv } from "../../../../lib/env";
import { nextMonthStart } from "../../../../lib/tailoring/ai/quota";
import { analyzeFit, fitState } from "../../../../lib/tailoring/fit/service";
import { isExplanationLanguage } from "../../../../lib/tailoring/fit/ai/prompts";
import { getCurrentWorkspace, recordAuditEvent } from "../../../../lib/workspace";
import { contextOrError, readBody } from "./http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Job fit assessment (#971, lib/tailoring/fit).
 *
 * GET: the saved AI assessment for this job (marked stale when the job,
 * profile version or evidence changed since), the free keyword check, and
 * the gate tailoring applies. Never calls a provider.
 *
 * POST: "Analyze job fit", an explicit action. Reuses the saved result for
 * identical inputs (no new charge), deduplicates concurrent requests, and
 * on budget, provider, timeout or invalid-output failure answers 200 with
 * `ok: false`, the reason, any earlier (stale) result and the keyword
 * check, so the page can stay useful and honest.
 */

function aiInfo() {
  const provider = getEnv().aiProvider;
  return { provider, available: provider !== "anthropic", budgetResetsOn: nextMonthStart().toISOString().slice(0, 10) };
}

export async function GET(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const url = new URL(request.url);
  const loaded = await contextOrError(workspace.id, url.searchParams.get("targetJobId"), url.searchParams.get("profileVersionId"));
  if ("response" in loaded) return loaded.response;
  return NextResponse.json({ ...(await fitState(loaded.context)), ai: aiInfo() });
}

export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  const language = body.language === undefined ? "en" : body.language;
  if (!isExplanationLanguage(language)) return NextResponse.json({ error: "Invalid language." }, { status: 400 });
  const loaded = await contextOrError(workspace.id, body.targetJobId, body.profileVersionId);
  if ("response" in loaded) return loaded.response;

  const result = await analyzeFit(loaded.context, { language, signal: request.signal });
  await recordAuditEvent(workspace.id, "tailoring.fit_analyzed", {
    targetJobId: loaded.context.targetJobId,
    outcome: result.ok ? (result.reused ? "reused" : "analyzed") : result.reason,
  });
  if (result.ok) return NextResponse.json({ ok: true, reused: result.reused, ...result.state, ai: aiInfo() });
  return NextResponse.json({ ok: false, reason: result.reason, ...result.state, ai: aiInfo() });
}
