import { NextResponse } from "next/server";
import { getJobmatchDb } from "../../../../lib/db/client";
import { loadGenerationEvidence } from "../../../../lib/evidence/store";
import { evidenceRelevanceForJob } from "../../../../lib/tailoring/selection/select";
import { usedRevisionIds } from "../../../../lib/evidence/prompt";
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
import {
  countFeedback,
  deriveFeedback,
  FEEDBACK_VERSION,
  readOriginalSuggestions,
  type FeedbackItem,
  type OriginalSuggestions,
} from "../../../../lib/tailoring/feedback";
import {
  parsePromotionRequest,
  promotionFailed,
  resolvePromotions,
  type PromotionError,
  type PromotionOutcome,
  type ResolvedPromotions,
} from "../../../../lib/tailoring/feedbackScope";
import { experienceRefOf, EVIDENCE_INPUT_MESSAGES, MAX_EVIDENCE_ITEMS } from "../../../../lib/evidence/contract";
import { createEvidence } from "../../../../lib/evidence/store";
import { getWritingPreferences, saveWritingPreferences } from "../../../../lib/writingPreferences/store";
import { EMPTY_WRITING_PREFERENCES } from "../../../../lib/writingPreferences/contract";

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
/** Origins as the client sent them, per role; anything unreadable is "own". */
function readOrigins(value: unknown): (number | null)[][] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 60).map((row) =>
    Array.isArray(row) ? row.slice(0, 8).map((v) => (typeof v === "number" && Number.isInteger(v) ? v : null)) : [],
  );
}

/** The same cleaning deriveFeedback applies: each origin once, in range. */
function cleanBulletOrigins(origins: (number | null)[][], approved: string[][], original: string[][]): (number | null)[][] {
  return approved.map((bullets, role) => {
    const used = new Set<number>();
    return bullets.map((_, i) => {
      const v = origins[role]?.[i] ?? null;
      if (v === null || v < 0 || v >= (original[role]?.length ?? 0) || used.has(v)) return null;
      used.add(v);
      return v;
    });
  });
}

function promotionErrorMessage(error: PromotionError): string {
  switch (error.code) {
    case "too_many_background":
      return "You can add up to 3 bullets to your background in one save.";
    case "background_target":
      return "Only a bullet you wrote or rewrote, and kept on this CV, can be added to your background. Check your choices and save again.";
    case "background_input":
      return EVIDENCE_INPUT_MESSAGES[error.field];
    case "preference_input":
      return error.field === "style_note_factual"
        ? "Your new style note reads like a fact about you. A style note only steers wording: add facts to your background instead."
        : error.field === "style_note_too_long"
          ? "Keep each style note to 300 characters."
          : "Your new writing preference could not be read. Check it and save again.";
    default:
      return "Your choices to remember could not be read. Check them and save again.";
  }
}

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
    bulletOrigins: rawBulletOrigins,
    feedbackReasons,
    promotions: rawPromotions,
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
      /** #932: aligned with approved.paragraphs, the original paragraph
       *  each one started from. */
      paragraphOrigins?: unknown;
    } | null;
    /** #932: aligned with approved.experienceBullets, the original AI
     *  bullet each approved one started from (null: the candidate's own).
     *  Only labels feedback; never changes what is saved. */
    bulletOrigins?: unknown;
    /** #932: optional reason codes by feedback key. */
    feedbackReasons?: unknown;
    /** #932: what the candidate explicitly chose to remember. */
    promotions?: unknown;
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
    select: { context: true, suggestions: true, coverLetterSuggestion: true, promptVersion: true, modelVersion: true, coverLetterPromptVersion: true, coverLetterModelVersion: true },
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
      evidenceRevisionIds: usedRevisionIds(
        // #930: a snapshot with a selection ranked evidence by job
        // relevance; re-select the same way. Older snapshots: oldest first.
        await loadGenerationEvidence(
          workspace.id,
          targetJobId,
          version.content,
          previewContext.selection ? evidenceRelevanceForJob(targetJob.rawText ?? "") : undefined,
        ),
        previewContext.coverLetter !== null,
      ),
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

  // #932: feedback against the server's copy of the suggestions, and the
  // explicit "remember" choices, all checked before the claim so a choice
  // that cannot be saved leaves the preview usable.
  const original: OriginalSuggestions = readOriginalSuggestions({
    cv: storedPreview?.suggestions ?? null,
    coverLetter: storedPreview?.coverLetterSuggestion ?? null,
  });
  const promotionRequest = parsePromotionRequest(rawPromotions);
  if (!promotionRequest.ok) {
    return NextResponse.json({ error: promotionErrorMessage(promotionRequest.error), code: "PROMOTION_INVALID" }, { status: 422 });
  }
  const approvedBullets = suggestions?.experienceBullets ?? [];
  const originalBullets = original.cv?.experienceBullets ?? [];
  const bulletOrigins = cleanBulletOrigins(readOrigins(rawBulletOrigins), approvedBullets, originalBullets);
  const wantsPromotion = promotionRequest.value.preference !== null || promotionRequest.value.background.length > 0;
  let promotions: ResolvedPromotions = { preference: null, background: [] };
  let savedPreferenceRevision: string | null = null;
  if (wantsPromotion) {
    const savedWriting = promotionRequest.value.preference ? await getWritingPreferences(workspace.id) : null;
    savedPreferenceRevision = savedWriting?.revisionId ?? null;
    const resolved = resolvePromotions({
      request: promotionRequest.value,
      roles: version.content.experience.map(experienceRefOf),
      approvedBullets,
      bulletOrigins,
      originalBullets,
      savedPreferences: savedWriting?.preferences ?? EMPTY_WRITING_PREFERENCES,
    });
    if (!resolved.ok) {
      return NextResponse.json({ error: promotionErrorMessage(resolved.error), code: "PROMOTION_INVALID" }, { status: 422 });
    }
    if (resolved.value.preference && resolved.value.preference.baseRevisionId !== savedPreferenceRevision) {
      return NextResponse.json(
        {
          error: "Your writing preferences changed in another tab or window. Check the new style note and save again.",
          code: "PREFERENCES_STALE",
          current: savedWriting ?? null,
        },
        { status: 422 },
      );
    }
    if (resolved.value.background.length > 0) {
      const count = await db.candidateEvidence.count({ where: { workspaceId: workspace.id } });
      if (count + resolved.value.background.length > MAX_EVIDENCE_ITEMS) {
        return NextResponse.json(
          { error: `You can keep up to ${MAX_EVIDENCE_ITEMS} evidence items. Delete one you no longer need, or add fewer bullets to your background.`, code: "EVIDENCE_LIMIT" },
          { status: 422 },
        );
      }
    }
    promotions = resolved.value;
  }
  const feedbackInput = {
    original,
    profile: {
      headline: version.content.headline,
      summary: version.content.summary,
      skills: version.content.skills.map((skill) => skill.name),
      roles: version.content.experience.length,
    },
    approved: suggestions
      ? {
          headline: suggestions.headline,
          summary: suggestions.summary,
          skillsOrder: suggestions.skillsOrder,
          experienceBullets: suggestions.experienceBullets,
        }
      : null,
    bulletOrigins,
    letter: {
      included: letterSuggestion !== null,
      approved: letterSuggestion,
      paragraphOrigins: Array.isArray(coverLetter?.paragraphOrigins)
        ? (coverLetter!.paragraphOrigins as unknown[]).map((v) => (typeof v === "number" && Number.isInteger(v) ? v : null))
        : undefined,
    },
    reasons: feedbackReasons && typeof feedbackReasons === "object" && !Array.isArray(feedbackReasons) ? (feedbackReasons as Record<string, unknown>) : {},
  };
  const decisions: FeedbackItem[] = deriveFeedback(feedbackInput);
  const recordFeedback = Boolean(original.cv || original.coverLetter || wantsPromotion);

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
        // #932: written in the same statement as the CV, so a CV never
        // exists without its feedback and a failed write leaves neither.
        feedback: recordFeedback
          ? {
              create: {
                workspaceId: workspace.id,
                previewId,
                feedbackVersion: FEEDBACK_VERSION,
                original: {
                  ...original,
                  promptVersion: storedPreview?.promptVersion ?? promptVersion,
                  modelVersion: storedPreview?.modelVersion ?? modelVersion,
                  coverLetterPromptVersion: storedPreview?.coverLetterPromptVersion ?? null,
                  coverLetterModelVersion: storedPreview?.coverLetterModelVersion ?? null,
                } as never,
                decisions: decisions as never,
              },
            }
          : undefined,
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

  // #932: the explicit "remember" choices, once, now that the CV is saved.
  // A failure here never undoes the save: the candidate is told and can
  // add the item from the evidence panel or the profile instead.
  let failedPromotion = false;
  if (recordFeedback) {
    const outcome: PromotionOutcome = { preference: null, background: [] };
    if (promotions.preference) {
      try {
        const saved = await saveWritingPreferences(workspace.id, promotions.preference.prefs, promotions.preference.baseRevisionId);
        outcome.preference = saved.ok
          ? { status: saved.changed ? "saved" : "unchanged", revisionNumber: saved.current?.revisionNumber ?? null }
          : { status: "stale", revisionNumber: saved.current?.revisionNumber ?? null };
      } catch (error) {
        logError("tailoring.confirm.preference_failed", error, { tailoringId: row.id });
        outcome.preference = { status: "failed", revisionNumber: null };
      }
    }
    for (const item of promotions.background) {
      const base = { experienceIndex: item.experienceIndex, bulletIndex: item.bulletIndex, feedbackKey: item.feedbackKey };
      try {
        const created = await createEvidence(workspace.id, item.input, { scope: "BACKGROUND", targetJobId: null, confirm: true });
        outcome.background.push(
          created.ok
            ? { ...base, status: "saved", evidenceId: created.id, revisionId: created.revisionId }
            : { ...base, status: created.error === "too_many" ? "too_many" : "failed", evidenceId: null, revisionId: null },
        );
      } catch (error) {
        logError("tailoring.confirm.background_failed", error, { tailoringId: row.id });
        outcome.background.push({ ...base, status: "failed", evidenceId: null, revisionId: null });
      }
    }
    failedPromotion = promotionFailed(outcome);
    const promotedKeys = new Set(
      outcome.background.filter((b) => b.status === "saved" && b.feedbackKey).map((b) => b.feedbackKey as string),
    );
    try {
      if (wantsPromotion) {
        await db.tailoringFeedback.update({
          where: { tailoredResumeId: row.id },
          data: {
            promotions: outcome as never,
            decisions: (promotedKeys.size > 0 ? deriveFeedback({ ...feedbackInput, backgroundKeys: promotedKeys }) : decisions) as never,
          },
        });
      }
      // Counts only: never the text of a suggestion, edit or reason.
      const counts = countFeedback(decisions);
      await recordAuditEvent(workspace.id, "tailoring.feedback.recorded", {
        tailoringId: row.id,
        accepted: counts.accepted,
        edited: counts.edited,
        rejected: counts.rejected,
        preference: outcome.preference?.status ?? "none",
        background: outcome.background.filter((b) => b.status === "saved").length,
      });
    } catch (error) {
      logError("tailoring.confirm.feedback_update_failed", error, { tailoringId: row.id });
    }
  }

  return NextResponse.json({ id: row.id, coverLetterId, coverLetterError, feedbackRecorded: recordFeedback, promotionFailed: failedPromotion });
}
