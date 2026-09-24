import { NextResponse } from "next/server";
import { isPublicHttpsUrl } from "../../../../lib/tailoring/fetchJob";
import { fetchJobWithFallback } from "../../../../lib/tailoring/jobFetchAi/degraded";
import { getJobmatchDb } from "../../../../lib/db/client";
import { getCurrentWorkspace } from "../../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Re-run job extraction against a `TargetJob`'s own `sourceUrl`, in place —
 * for a job fetched before RESUMATCH_AI_PROVIDER was ever set to a real
 * provider (or before JM-005 was signed off), when only the deterministic
 * og:title/<title> scrape ran (lib/tailoring/fetchJob.ts's extractTitle),
 * which many job boards' pages don't support. The AI-assisted fetch
 * (lib/tailoring/jobFetchAi) reads the page itself and usually recovers a
 * title/employer that scrape never could. Only ever offered for a job that
 * has a real fetchable URL — paste/email/upload/manual intake all store a
 * pseudo-URL (see those routes' own `pasted://`/`email://`/`upload://`/
 * `manual://` sourceUrl values), which isPublicHttpsUrl already rejects.
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

  const { targetJobId } = (body ?? {}) as { targetJobId?: unknown };
  if (typeof targetJobId !== "string" || targetJobId.length === 0) {
    return NextResponse.json({ error: "targetJobId is required." }, { status: 400 });
  }

  const db = getJobmatchDb();
  const targetJob = await db.targetJob.findFirst({
    where: { id: targetJobId, workspaceId: workspace.id },
    select: { sourceUrl: true },
  });
  if (!targetJob) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!isPublicHttpsUrl(targetJob.sourceUrl)) {
    return NextResponse.json({ error: "This job wasn't fetched from a URL, so there's nothing to refresh." }, { status: 400 });
  }

  const result = await fetchJobWithFallback(workspace.id, targetJob.sourceUrl, { targetJobId });
  if (!result.ok) {
    return NextResponse.json({ error: "That page couldn't be read again." }, { status: 502 });
  }

  const updated = await db.targetJob.update({
    where: { id: targetJobId },
    data: { rawText: result.rawText, title: result.title, employer: result.employer, status: "FETCHED" },
    select: { title: true, employer: true },
  });

  return NextResponse.json({ title: updated.title, employer: updated.employer, degraded: result.degraded ?? false });
}
