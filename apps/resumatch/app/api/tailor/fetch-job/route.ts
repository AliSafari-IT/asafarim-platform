import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { fetchJobWithFallback } from "../../../../lib/tailoring/jobFetchAi/degraded";
import { getJobmatchDb } from "../../../../lib/db/client";
import { getCurrentWorkspace } from "../../../../lib/workspace";
import { findRecentFetch, openDraft } from "../../../../lib/tailoring/drafts/store";

export const dynamic = "force-dynamic";

/**
 * Fetch one job-posting URL a candidate pastes, and record it as a
 * `TargetJob`, with an open Tailor draft (lib/tailoring/drafts).
 *
 * The same URL fetched in the last REUSE_FETCH_DAYS is not fetched again:
 * the answer is that job (`reused: true`, with its `fetchedAt`), so leaving
 * the page and pasting the link again costs no time and no AI. The
 * candidate can still ask for a fresh copy (`refresh: true`, "Fetch
 * again"), for a posting that changed: that creates a new row, as every
 * fetch did before, and moves the old job's draft choices onto it.
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

  const { url, refresh } = (body ?? {}) as { url?: unknown; refresh?: unknown };
  if (typeof url !== "string" || url.trim().length === 0) {
    return NextResponse.json({ error: "url is required." }, { status: 400 });
  }
  if (refresh !== undefined && typeof refresh !== "boolean") {
    return NextResponse.json({ error: "refresh must be true or false." }, { status: 400 });
  }

  const db = getJobmatchDb();
  const recent = await findRecentFetch(workspace.id, url.trim());
  if (recent && refresh !== true) {
    await openDraft(workspace.id, recent.id);
    return NextResponse.json({
      id: recent.id,
      status: recent.status,
      title: recent.title,
      employer: recent.employer,
      snippet: (recent.rawText ?? "").slice(0, 400),
      quality: { looksIncomplete: recent.fetchLooksIncomplete ?? false, reasons: recent.fetchQualityReasons },
      reused: true,
      fetchedAt: recent.fetchedAt.toISOString(),
    });
  }

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
      fetchLooksIncomplete: result.quality.looksIncomplete,
      fetchQualityReasons: result.quality.reasons,
      status: "FETCHED",
    },
    select: { id: true, status: true, title: true, employer: true },
  });
  await openDraft(workspace.id, targetJob.id, recent?.id ?? null);

  return NextResponse.json({
    id: targetJob.id,
    status: targetJob.status,
    title: targetJob.title,
    employer: targetJob.employer,
    snippet: result.rawText.slice(0, 400),
    // #520: a warning, not a refusal. The job is stored and usable either way.
    quality: result.quality,
  });
}
