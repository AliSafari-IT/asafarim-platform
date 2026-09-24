import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { fetchJobWithFallback } from "../../../../lib/tailoring/jobFetchAi/degraded";
import { getJobmatchDb } from "../../../../lib/db/client";
import { getCurrentWorkspace } from "../../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Fetch one job-posting URL a candidate pastes, and record it as a
 * `TargetJob`. Always creates a new row — a candidate re-pasting the same
 * URL later may be tailoring toward an updated posting, and there is no
 * reason to force a stale one to be reused.
 */
export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { url } = (body ?? {}) as { url?: unknown };
  if (typeof url !== "string" || url.trim().length === 0) {
    return NextResponse.json({ error: "url is required." }, { status: 400 });
  }

  const db = getJobmatchDb();
  // Minted before the (possibly AI) fetch so its cost event names this job
  // even though the row is only created once the fetch returns (issue #586).
  const targetJobId = randomUUID();
  const result = await fetchJobWithFallback(workspace.id, url.trim(), { targetJobId });

  if (!result.ok) {
    const targetJob = await db.targetJob.create({
      data: {
        id: targetJobId,
        workspaceId: workspace.id,
        sourceUrl: url.trim(),
        status: "FETCH_FAILED",
      },
      select: { id: true, status: true },
    });
    return NextResponse.json(
      { id: targetJob.id, status: targetJob.status, reasonCode: result.reasonCode },
      { status: 200 },
    );
  }

  const targetJob = await db.targetJob.create({
    data: {
      id: targetJobId,
      workspaceId: workspace.id,
      sourceUrl: url.trim(),
      rawText: result.rawText,
      title: result.title,
      employer: result.employer,
      status: "FETCHED",
    },
    select: { id: true, status: true, title: true, employer: true },
  });

  return NextResponse.json({
    id: targetJob.id,
    status: targetJob.status,
    title: targetJob.title,
    employer: targetJob.employer,
    snippet: result.rawText.slice(0, 400),
  });
}
