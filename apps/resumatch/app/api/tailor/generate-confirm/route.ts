import { NextResponse } from "next/server";
import { getJobmatchDb } from "../../../../lib/db/client";
import { getVersion } from "../../../../lib/profile/versions";
import { mergeTailoringSuggestions, parseTailorSuggestions } from "../../../../lib/tailoring/ai/schema";
import { buildCoverLetterContent } from "../../../../lib/tailoring/ai/coverLetter/generate";
import { parseCoverLetterSuggestion } from "../../../../lib/tailoring/ai/coverLetter/schema";
import { getCurrentWorkspace } from "../../../../lib/workspace";

export const dynamic = "force-dynamic";
const DEFAULT_TEMPLATE_KEY = "classic";

/**
 * Step 2 of the proposal-review tailoring flow (issue #429): persist a
 * `TailoredResume` from exactly what the candidate approved on the
 * `generate-preview` review screen — accepted, edited, or declined per
 * field/bullet, never the provider's raw output taken as-is.
 *
 * The profile is reloaded from the database rather than trusted from the
 * request: `approved` (parsed through the same `tailorSuggestionsSchema`
 * every provider response already goes through) only ever supplies
 * reworded text and a skill/bullet selection, and
 * `mergeTailoringSuggestions` is still the sole function that turns that,
 * plus the server's own copy of the profile, into persisted content — a
 * client cannot inject an employer, a date, or a skill this way any more
 * than a provider response itself can.
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

  const {
    profileVersionId,
    targetJobId,
    approved,
    degraded,
    promptVersion,
    modelVersion,
    templateKey,
    coverLetter,
  } = (body ?? {}) as {
    profileVersionId?: unknown;
    targetJobId?: unknown;
    approved?: unknown;
    degraded?: unknown;
    promptVersion?: unknown;
    modelVersion?: unknown;
    templateKey?: unknown;
    /** Optional — issue #454. Absent or null: no cover letter was drafted
     *  or the candidate declined it; the CV still saves either way. */
    coverLetter?: {
      approved: unknown;
      degraded?: unknown;
      promptVersion?: unknown;
      modelVersion?: unknown;
    } | null;
  };

  if (typeof profileVersionId !== "string" || typeof targetJobId !== "string") {
    return NextResponse.json({ error: "profileVersionId and targetJobId are required." }, { status: 400 });
  }
  if (typeof promptVersion !== "string" || typeof modelVersion !== "string") {
    return NextResponse.json({ error: "promptVersion and modelVersion are required." }, { status: 400 });
  }

  const version = await getVersion(workspace.id, profileVersionId);
  if (!version) return NextResponse.json({ error: "Profile version not found." }, { status: 404 });

  const db = getJobmatchDb();
  const targetJob = await db.targetJob.findFirst({
    where: { id: targetJobId, workspaceId: workspace.id },
    select: { id: true },
  });
  if (!targetJob) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  let suggestions;
  try {
    // `approved: null` is a legitimate choice — the candidate declined
    // every suggestion — and merges to the profile carried over unchanged,
    // same as a genuinely degraded call.
    suggestions = approved === null ? null : parseTailorSuggestions(approved);
  } catch {
    return NextResponse.json({ error: "That review could not be saved as written." }, { status: 422 });
  }

  const content = mergeTailoringSuggestions(version.content, suggestions);

  const row = await db.tailoredResume.create({
    data: {
      workspaceId: workspace.id,
      profileVersionId,
      targetJobId,
      content,
      templateKey: typeof templateKey === "string" ? templateKey : DEFAULT_TEMPLATE_KEY,
      promptVersion,
      modelVersion,
      degraded: degraded === true,
    },
    select: { id: true },
  });

  // The letter is declined by omitting `coverLetter` or sending
  // `coverLetter.approved: null` — a legitimate outcome the same way
  // `approved: null` is for the CV above. Nothing about the tailored
  // resume above depends on this; a rejected letter never blocks the CV.
  let coverLetterId: string | null = null;
  if (coverLetter && coverLetter.approved !== null && coverLetter.approved !== undefined) {
    if (typeof coverLetter.promptVersion !== "string" || typeof coverLetter.modelVersion !== "string") {
      return NextResponse.json({ error: "Cover-letter promptVersion and modelVersion are required." }, { status: 400 });
    }
    let letterSuggestion;
    try {
      letterSuggestion = parseCoverLetterSuggestion(coverLetter.approved);
    } catch {
      return NextResponse.json({ error: "That cover-letter review could not be saved as written." }, { status: 422 });
    }
    const letterContent = buildCoverLetterContent(letterSuggestion, version.content.fullName);
    const letterRow = await db.coverLetter.create({
      data: {
        workspaceId: workspace.id,
        profileVersionId,
        targetJobId,
        content: letterContent,
        promptVersion: coverLetter.promptVersion,
        modelVersion: coverLetter.modelVersion,
        degraded: coverLetter.degraded === true,
      },
      select: { id: true },
    });
    coverLetterId = letterRow.id;
  }

  return NextResponse.json({ id: row.id, coverLetterId });
}
