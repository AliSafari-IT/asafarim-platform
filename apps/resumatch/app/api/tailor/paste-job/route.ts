import { NextResponse } from "next/server";
import { normalizeWhitespace } from "../../../../lib/extraction/text";
import { MAX_EXTRACTED_CHARACTERS, MIN_USEFUL_CHARACTERS } from "../../../../lib/tailoring/fetchJob";
import { inferJobMetaWithFallback } from "../../../../lib/tailoring/jobMetaAi/degraded";
import { getJobmatchDb } from "../../../../lib/db/client";
import { getCurrentWorkspace } from "../../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Accept a pasted job description as an alternative to `/api/tailor/fetch-job`
 * (issue #426). A large share of real postings can't be fetched at all —
 * LinkedIn/Indeed sit behind a login wall, many ATS pages expire, and this
 * app's own no-redirect posture refuses pages that redirect — so this path
 * skips the network fetch entirely rather than trying harder to fetch.
 *
 * This actually SHRINKS the SSRF surface rather than growing it: no
 * outbound request happens for pasted input, at all. Title/employer used to
 * stay null unconditionally — there was no reliable heuristic for pulling a
 * title out of arbitrary pasted prose the way `<title>`/`og:title` works
 * for a fetched page, and a wrong guess was worse than an honest blank.
 * That reasoning predates RESUMATCH_AI_PROVIDER ever being set to a real
 * provider; lib/tailoring/jobMetaAi/degraded.ts now takes one small,
 * budget-gated AI pass at it (its own HARD RULES forbid inventing a value
 * — an honest null is still the expected, common outcome), and returns
 * null/null itself whenever no real provider is configured, so this route
 * degrades to the exact old behavior with nothing further to guard here.
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

  const { text } = (body ?? {}) as { text?: unknown };
  if (typeof text !== "string") {
    return NextResponse.json({ error: "text is required." }, { status: 400 });
  }

  const rawText = normalizeWhitespace(text).slice(0, MAX_EXTRACTED_CHARACTERS);
  if (rawText.length < MIN_USEFUL_CHARACTERS) {
    return NextResponse.json(
      { error: `Paste at least ${MIN_USEFUL_CHARACTERS} characters of the job description.` },
      { status: 400 },
    );
  }

  const meta = await inferJobMetaWithFallback(workspace.id, rawText);

  const db = getJobmatchDb();
  const targetJob = await db.targetJob.create({
    data: {
      workspaceId: workspace.id,
      // No fetch happened, so there is no real URL — a sentinel keeps
      // sourceUrl (a required column) honest about that rather than
      // storing a fabricated-looking address.
      sourceUrl: "pasted://job-description",
      rawText,
      title: meta.title,
      employer: meta.employer,
      status: "FETCHED",
    },
    select: { id: true, status: true },
  });

  return NextResponse.json({
    id: targetJob.id,
    status: targetJob.status,
    title: meta.title,
    employer: meta.employer,
    snippet: rawText.slice(0, 400),
  });
}
