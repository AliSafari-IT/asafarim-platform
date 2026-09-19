import { NextResponse } from "next/server";
import { normalizeWhitespace } from "../../../../lib/extraction/text";
import { MAX_EXTRACTED_CHARACTERS, MIN_USEFUL_CHARACTERS } from "../../../../lib/tailoring/fetchJob";
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
 * outbound request happens for pasted input, at all. Title/employer stay
 * null — there is no reliable heuristic for pulling a title out of
 * arbitrary pasted prose the way `<title>`/`og:title` works for a fetched
 * page, and a wrong guess here is worse than an honest blank.
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

  const db = getJobmatchDb();
  const targetJob = await db.targetJob.create({
    data: {
      workspaceId: workspace.id,
      // No fetch happened, so there is no real URL — a sentinel keeps
      // sourceUrl (a required column) honest about that rather than
      // storing a fabricated-looking address.
      sourceUrl: "pasted://job-description",
      rawText,
      title: null,
      employer: null,
      status: "FETCHED",
    },
    select: { id: true, status: true },
  });

  return NextResponse.json({
    id: targetJob.id,
    status: targetJob.status,
    title: null,
    employer: null,
    snippet: rawText.slice(0, 400),
  });
}
