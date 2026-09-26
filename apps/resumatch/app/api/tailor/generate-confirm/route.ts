import { NextResponse } from "next/server";
import { getJobmatchDb } from "../../../../lib/db/client";
import { getVersion } from "../../../../lib/profile/versions";
import { mergeTailoringSuggestions, parseTailorSuggestions } from "../../../../lib/tailoring/ai/schema";
import { buildCoverLetterContent } from "../../../../lib/tailoring/ai/coverLetter/generate";
import { parseCoverLetterSuggestion } from "../../../../lib/tailoring/ai/coverLetter/schema";
import { getCurrentWorkspace } from "../../../../lib/workspace";
import { appliedCoverLetterLanguage, appliedOutputLanguage } from "../../../../lib/tailoring/language";

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
 *
 * Provenance (`promptVersion`/`modelVersion`/`degraded`) is *not* taken
 * from the request body (issue #525): a client calling this route directly,
 * skipping `generate-preview` and its provider call/budget spend entirely,
 * used to be able to claim any model name and `degraded: false` it liked.
 * `previewId` must name a `TailorPreview` row `generate-preview` itself
 * wrote right after the provider call(s) it actually made; this route reads
 * provenance from that row and consumes it, so it cannot back a second
 * confirm.
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
    previewId,
    approved,
    templateKey,
    instructions,
    coverLetter,
  } = (body ?? {}) as {
    profileVersionId?: unknown;
    targetJobId?: unknown;
    previewId?: unknown;
    approved?: unknown;
    templateKey?: unknown;
    /** Optional — issue #431. Echoed back from generate-preview's request
     *  for provenance; never re-sent to a provider at this step. */
    instructions?: unknown;
    /** Optional — issue #454. Absent or null: no cover letter was drafted
     *  or the candidate declined it; the CV still saves either way. */
    coverLetter?: {
      approved: unknown;
    } | null;
  };

  if (typeof profileVersionId !== "string" || typeof targetJobId !== "string") {
    return NextResponse.json({ error: "profileVersionId and targetJobId are required." }, { status: 400 });
  }
  if (typeof previewId !== "string") {
    return NextResponse.json({ error: "previewId is required." }, { status: 400 });
  }

  const version = await getVersion(workspace.id, profileVersionId);
  if (!version) return NextResponse.json({ error: "Profile version not found." }, { status: 404 });

  const db = getJobmatchDb();
  const targetJob = await db.targetJob.findFirst({
    where: { id: targetJobId, workspaceId: workspace.id },
    select: { id: true },
  });
  if (!targetJob) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  // The atomic claim: only a request whose update actually matches a row
  // (count === 1) gets to treat this preview's provenance as real, exactly
  // the same single-winner shape lib/documents/service.ts's rescanDocument
  // and extractDocument use for their own claims. Scoped to the exact
  // workspace/profileVersion/targetJob this confirm is for, not just the id
  // — a previewId that's real but was generated for a different job or
  // profile version must not be reusable here.
  const claim = await db.tailorPreview.updateMany({
    where: {
      id: previewId,
      workspaceId: workspace.id,
      profileVersionId,
      targetJobId,
      consumedAt: null,
    },
    data: { consumedAt: new Date() },
  });
  if (claim.count === 0) {
    return NextResponse.json(
      { error: "That preview is missing, expired, or already used. Generate a new one." },
      { status: 409 },
    );
  }
  const preview = await db.tailorPreview.findFirstOrThrow({ where: { id: previewId } });
  const degraded = preview.degraded;
  const promptVersion = preview.promptVersion;
  const modelVersion = preview.modelVersion;

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
      degraded,
      instructions: typeof instructions === "string" ? instructions.trim() || null : null,
      // #641: from the server's preview record, never the client — and only
      // if some AI-written prose was kept (see appliedOutputLanguage).
      outputLanguage: appliedOutputLanguage(preview.outputLanguage, degraded, suggestions),
    },
    select: { id: true },
  });

  // The letter is declined by omitting `coverLetter` or sending
  // `coverLetter.approved: null` — a legitimate outcome the same way
  // `approved: null` is for the CV above. Nothing about the tailored
  // resume above depends on this; a rejected letter never blocks the CV.
  let coverLetterId: string | null = null;
  if (coverLetter && coverLetter.approved !== null && coverLetter.approved !== undefined) {
    if (preview.coverLetterPromptVersion === null || preview.coverLetterModelVersion === null) {
      return NextResponse.json(
        { error: "That preview did not include a cover letter." },
        { status: 400 },
      );
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
        // Pairs this letter with the specific CV it was reviewed alongside
        // — targetJobId alone can't do that once a candidate re-tailors
        // toward the same job more than once. See the schema's own comment
        // on CoverLetter.tailoredResumeId.
        tailoredResumeId: row.id,
        content: letterContent,
        promptVersion: preview.coverLetterPromptVersion,
        modelVersion: preview.coverLetterModelVersion,
        degraded: preview.coverLetterDegraded === true,
        // #642: from the server's preview record, and null if degraded.
        outputLanguage: appliedCoverLetterLanguage(
          preview.coverLetterOutputLanguage,
          preview.coverLetterDegraded === true,
        ),
      },
      select: { id: true },
    });
    coverLetterId = letterRow.id;
  }

  return NextResponse.json({ id: row.id, coverLetterId });
}
