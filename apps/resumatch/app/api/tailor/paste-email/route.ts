import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { MAX_EXTRACTED_CHARACTERS, MIN_USEFUL_CHARACTERS } from "../../../../lib/tailoring/fetchJob";
import { inferJobMetaWithFallback } from "../../../../lib/tailoring/jobMetaAi/degraded";
import { parseJobInvitationEmail } from "../../../../lib/tailoring/parseEmail";
import { getJobmatchDb } from "../../../../lib/db/client";
import { getCurrentWorkspace } from "../../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Accept a pasted job-invitation email as a third alternative to
 * `fetch-job` (URL) and `paste-job` (plain description text) — issue #459,
 * part of #458. Strips signature blocks, disclaimer footers, and quoted
 * reply/thread noise (lib/tailoring/parseEmail.ts) so the candidate doesn't
 * have to hand-edit a forwarded email down to just the role description.
 *
 * Same trust boundary as paste-job: no email/inbox integration, the
 * candidate explicitly pastes text they already have. `title`/`employer`
 * are best-effort guesses from the subject/From line, shown for
 * confirmation exactly like a fetched page's <title>/og:title — never
 * persisted as if they were verified.
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

  const { text, subject } = (body ?? {}) as { text?: unknown; subject?: unknown };
  if (typeof text !== "string") {
    return NextResponse.json({ error: "text is required." }, { status: 400 });
  }

  const parsed = parseJobInvitationEmail(text, typeof subject === "string" ? subject : null);
  const rawText = parsed.rawText.slice(0, MAX_EXTRACTED_CHARACTERS);
  if (rawText.length < MIN_USEFUL_CHARACTERS) {
    return NextResponse.json(
      { error: `That email doesn't have enough job-description text left after cleanup (need at least ${MIN_USEFUL_CHARACTERS} characters). Try pasting just the role description instead.` },
      { status: 400 },
    );
  }

  // The header guess (subject/From line) is cheap and often right when the
  // email actually names the role there; only spend an AI call filling in
  // whichever half it missed, rather than redoing both from scratch.
  // Pre-minted so a metadata call's cost event names this job (issue #586).
  const targetJobId = randomUUID();
  let title = parsed.guessedTitle;
  let employer = parsed.guessedEmployer;
  if (!title || !employer) {
    const meta = await inferJobMetaWithFallback(workspace.id, rawText, { targetJobId });
    title = title ?? meta.title;
    employer = employer ?? meta.employer;
  }

  const db = getJobmatchDb();
  const targetJob = await db.targetJob.create({
    data: {
      id: targetJobId,
      workspaceId: workspace.id,
      // No fetch happened — same sentinel pattern paste-job uses for
      // sourceUrl, a required column with no real URL here (see #458).
      sourceUrl: "email://job-invitation",
      rawText,
      title,
      employer,
      status: "FETCHED",
    },
    select: { id: true, status: true },
  });

  return NextResponse.json({
    id: targetJob.id,
    status: targetJob.status,
    title,
    employer,
    snippet: rawText.slice(0, 400),
  });
}
