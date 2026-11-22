import { NextResponse } from "next/server";
import { getJobmatchDb } from "../../../../lib/db/client";
import { loadGenerationEvidence } from "../../../../lib/evidence/store";
import { getVersion } from "../../../../lib/profile/versions";
import { mergeTailoringSuggestions, parseApprovedTailorSuggestions } from "../../../../lib/tailoring/ai/schema";
import { buildCoverLetterContent } from "../../../../lib/tailoring/ai/coverLetter/generate";
import { parseCoverLetterSuggestion } from "../../../../lib/tailoring/ai/coverLetter/schema";
import { getCurrentWorkspace, recordAuditEvent } from "../../../../lib/workspace";
import { appliedCoverLetterLanguage, appliedOutputLanguage } from "../../../../lib/tailoring/language";
import { logError } from "../../../../lib/observability/logger";
import { contextForSavedCv, parseStoredTailoringContext, staleContextReason } from "../../../../lib/tailoring/context";
import {
  applyCandidateEdits,
  hasCandidateEdits,
  MAX_CV_SKILLS,
  parseCandidateEdits,
  TooManySkillsError,
} from "../../../../lib/tailoring/candidateEdits";

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
function withoutNonAiBullets<T extends { experienceBullets: string[][] }>(suggestions: T | null, texts: string[]): T | null {
  if (!suggestions) return suggestions;
  const nonAi = new Set(texts.map((text) => text.trim()).filter(Boolean));
  return {
    ...suggestions,
    experienceBullets: suggestions.experienceBullets.map((bullets) => bullets.filter((b) => !nonAi.has(b.trim()))),
  };
}

/** A summary the candidate wrote (or took from their profile) is theirs,
 *  not AI prose, so it doesn't make the CV "in" the requested language. */
function withoutOwnSummary<T extends { summary: string | null }>(suggestions: T | null, ownSummary: string | null): T | null {
  if (!suggestions || !ownSummary || suggestions.summary?.trim() !== ownSummary.trim()) return suggestions;
  return { ...suggestions, summary: null };
}

export async function POST(request: Request) {
  try {
    return await confirmTailoring(request);
  } catch (error) {
    // Anything unexpected still answers JSON with a sentence the candidate
    // can act on, never Next's bare HTML 500 page (which the tailor flow
    // can only show as "the server returned an error (HTTP 500)").
    logError("tailoring.confirm.failed", error);
    return NextResponse.json(
      {
        error:
          "Something went wrong while saving this tailored CV. Try Save again; if it keeps failing, generate the suggestions again.",
      },
      { status: 500 },
    );
  }
}

async function confirmTailoring(request: Request): Promise<Response> {
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
    candidateEdits: rawCandidateEdits,
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
    /** Optional (0.4.0): skills the candidate added or removed for this
     *  CV and the bullets they wrote — their own claims, see
     *  lib/tailoring/candidateEdits.ts. Never written to the profile. */
    candidateEdits?: unknown;
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
    select: { id: true, rawText: true },
  });
  if (!targetJob) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  // #928: a preview made with a request context can only back a save while
  // that context still holds: same job text and the same note. Read before
  // the claim, so a stale preview is refused without being used up. The
  // lookup is workspace-scoped, so another workspace's preview id reads as
  // missing. Legacy previews (no context) confirm exactly as before.
  const storedPreview = await db.tailorPreview.findFirst({
    where: { id: previewId, workspaceId: workspace.id },
    select: { context: true },
  });
  const previewContext = parseStoredTailoringContext(storedPreview?.context ?? null);
  if (previewContext) {
    const stale = staleContextReason(previewContext, {
      workspaceId: workspace.id,
      profileVersionId,
      targetJobId,
      jobRawText: targetJob.rawText,
      instructions: typeof instructions === "string" ? instructions : undefined,
      profileVersionConfirmed: version.isConfirmed,
      // #929: the evidence a run would use now must be the evidence this one used.
      evidenceRevisionIds: (await loadGenerationEvidence(workspace.id, targetJobId, version.content)).revisionIds,
    });
    if (stale) {
      return NextResponse.json(
        {
          error:
            stale === "job_text"
              ? "The job text changed after these suggestions were made. Generate them again."
              : stale === "instructions"
                ? "Your note changed after these suggestions were made. Generate them again."
                : stale === "profile_version"
                  ? "Your confirmed profile changed after these suggestions were made. Generate them again."
                : stale === "evidence"
                  ? "Your evidence changed after these suggestions were made. Generate them again."
                : "That preview is missing, expired, or already used. Generate a new one.",
          code: "PREVIEW_CONTEXT_STALE",
          reason: stale,
        },
        { status: 409 },
      );
    }
  }

  // Everything that validates what the candidate sent happens before the
  // preview is claimed below, so a review that cannot be saved as written
  // leaves the preview usable for another try instead of burning it.
  let suggestions;
  try {
    // `approved: null` is a legitimate choice — the candidate declined
    // every suggestion — and merges to the profile carried over unchanged,
    // same as a genuinely degraded call.
    suggestions = approved === null ? null : parseApprovedTailorSuggestions(approved);
  } catch {
    return NextResponse.json(
      { error: "That review could not be saved as written. Shorten any edited text and try again." },
      { status: 422 },
    );
  }

  let candidateEdits;
  try {
    candidateEdits = parseCandidateEdits(rawCandidateEdits);
  } catch {
    return NextResponse.json(
      { error: "Your added skills or bullets could not be saved as written. Shorten any long text and try again." },
      { status: 422 },
    );
  }

  let content;
  try {
    content = applyCandidateEdits(mergeTailoringSuggestions(version.content, suggestions), candidateEdits);
  } catch (error) {
    if (error instanceof TooManySkillsError) {
      return NextResponse.json(
        { error: `A CV can hold at most ${MAX_CV_SKILLS} skills. Remove some, then save again.` },
        { status: 422 },
      );
    }
    logError("tailoring.confirm.merge_invalid", error, { profileVersionId });
    return NextResponse.json(
      {
        error:
          "Your confirmed profile has a field this CV cannot hold (for example a very long text). Check your profile, confirm it again, and retry.",
      },
      { status: 422 },
    );
  }

  const wantsLetter = Boolean(coverLetter && coverLetter.approved !== null && coverLetter.approved !== undefined);
  let letterSuggestion: ReturnType<typeof parseCoverLetterSuggestion> | null = null;
  if (wantsLetter) {
    try {
      letterSuggestion = parseCoverLetterSuggestion(coverLetter!.approved);
    } catch {
      return NextResponse.json(
        { error: "That cover-letter review could not be saved as written. Shorten any edited text and try again." },
        { status: 422 },
      );
    }
  }

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

  // If the write itself fails, hand the preview back so the candidate can
  // press Save again instead of having to generate (and pay for) a new one.
  const releaseClaim = () =>
    db.tailorPreview
      .updateMany({ where: { id: previewId, workspaceId: workspace.id }, data: { consumedAt: null } })
      .catch((error: unknown) => logError("tailoring.confirm.release_failed", error));

  let row: { id: string; outputLanguage: string | null };
  try {
    row = await db.tailoredResume.create({
      data: {
        workspaceId: workspace.id,
        profileVersionId,
        targetJobId,
        content,
        templateKey: typeof templateKey === "string" ? templateKey : DEFAULT_TEMPLATE_KEY,
        promptVersion,
        modelVersion,
        degraded,
        // #928: the note the provider calls actually got, from the server's
        // snapshot. Only a legacy preview still takes the client's echo.
        instructions: previewContext
          ? previewContext.instructions
          : typeof instructions === "string"
            ? instructions.trim() || null
            : null,
        tailoringContext: previewContext ? (contextForSavedCv(previewContext) as never) : undefined,
        candidateEdits: hasCandidateEdits(candidateEdits) ? candidateEdits : undefined,
        // #641: from the server's preview record, never the client — and only
        // if some AI-written prose was kept (see appliedOutputLanguage).
        // Bullets and a summary the candidate wrote, and a role summary kept
        // as written, are not AI prose, so they don't make the CV "in" that language.
        outputLanguage: appliedOutputLanguage(
          preview.outputLanguage,
          degraded,
          withoutNonAiBullets(withoutOwnSummary(suggestions, candidateEdits.ownSummary), [
            ...candidateEdits.ownBullets.flatMap((row) => row.bullets),
            ...version.content.experience.map((entry) => entry.summary ?? ""),
          ]),
        ),
      },
      select: { id: true, outputLanguage: true },
    });
  } catch (error) {
    await releaseClaim();
    throw error;
  }
  await recordAuditEvent(workspace.id, "tailoring.created", {
    tailoringId: row.id,
    targetJobId,
    degraded,
    outputLanguage: row.outputLanguage ?? "",
  });

  // The letter is declined by omitting `coverLetter` or sending
  // `coverLetter.approved: null` — a legitimate outcome the same way
  // `approved: null` is for the CV above. Nothing about the tailored
  // resume above depends on this; a rejected letter never blocks the CV.
  // From here on the CV is saved, so nothing below may answer as if the
  // whole save failed: a letter problem comes back next to the CV's id.
  let coverLetterId: string | null = null;
  let coverLetterError: string | null = null;
  if (letterSuggestion) {
    if (preview.coverLetterPromptVersion === null || preview.coverLetterModelVersion === null) {
      coverLetterError = "Your CV was saved, but that preview did not include a cover letter.";
    } else {
      const coverLetterPromptVersion = preview.coverLetterPromptVersion;
      const coverLetterModelVersion = preview.coverLetterModelVersion;
      try {
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
            promptVersion: coverLetterPromptVersion,
            modelVersion: coverLetterModelVersion,
            degraded: preview.coverLetterDegraded === true,
            // #642: from the server's preview record, and null if degraded.
            outputLanguage: appliedCoverLetterLanguage(
              preview.coverLetterOutputLanguage,
              preview.coverLetterDegraded === true,
            ),
          },
          select: { id: true, degraded: true, outputLanguage: true },
        });
        coverLetterId = letterRow.id;
        await recordAuditEvent(workspace.id, "cover_letter.created", {
          coverLetterId: letterRow.id,
          tailoringId: row.id,
          targetJobId,
          degraded: letterRow.degraded,
          outputLanguage: letterRow.outputLanguage ?? "",
        });
      } catch (error) {
        logError("tailoring.confirm.cover_letter_failed", error, { tailoringId: row.id });
        coverLetterError = "Your CV was saved, but the cover letter could not be saved.";
      }
    }
  }

  return NextResponse.json({ id: row.id, coverLetterId, coverLetterError });
}
