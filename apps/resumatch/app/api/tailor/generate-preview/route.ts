import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { runTailorProviderCall } from "../../../../lib/tailoring/ai/generate";
import { MAX_INSTRUCTIONS_CHARS } from "../../../../lib/tailoring/ai/prompts";
import { runCoverLetterProviderCall } from "../../../../lib/tailoring/ai/coverLetter/generate";
import { nextMonthStart } from "../../../../lib/tailoring/ai/quota";
import { COVER_LETTER_LENGTHS, COVER_LETTER_TONES, type CoverLetterLength, type CoverLetterTone } from "../../../../lib/tailoring/ai/coverLetter/prompts";
import { assessJobFit } from "../../../../lib/tailoring/jobFit";
import {
  resolveTailoringContext,
  tailoringContextFingerprint,
  TAILORING_CONTEXT_VERSION,
} from "../../../../lib/tailoring/context";
import { isOutputLanguage } from "../../../../lib/tailoring/language";
import { getJobmatchDb } from "../../../../lib/db/client";
import { loadGenerationEvidence } from "../../../../lib/evidence/store";
import { renderMotivationEvidence, renderProfessionalEvidence, usedRevisionIds } from "../../../../lib/evidence/prompt";
import { getVersion } from "../../../../lib/profile/versions";
import { extractRequirements } from "../../../../lib/tailoring/selection/requirements";
import {
  parseUnmetRequirementIds,
  evidenceRelevanceForJob,
  selectTailoringInputs,
} from "../../../../lib/tailoring/selection/select";
import { checkClaims } from "../../../../lib/tailoring/selection/claims";
import { getCurrentWorkspace } from "../../../../lib/workspace";
import { getWritingPreferences } from "../../../../lib/writingPreferences/store";
import { resolveWriting } from "../../../../lib/writingPreferences/resolve";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Step 1 of the proposal-review tailoring flow (issue #429): run the
 * provider call and hand the candidate the raw suggestions to review —
 * nothing is persisted here. `generate-confirm` is the only route that
 * writes a `TailoredResume` row, and only once the candidate has actually
 * seen and approved what it will contain.
 *
 * `includeCoverLetter` (issue #454, part of #453) opts into a second,
 * parallel provider call that drafts a cover letter for the same review
 * screen. Opt-in rather than automatic: it's a second spend against the
 * same monthly budget (lib/tailoring/ai/quota.ts's "cover_letter" kind),
 * and a candidate tailoring a CV toward a job they're still deciding on
 * shouldn't pay for a letter they didn't ask for yet.
 *
 * A job the fit check rates "low" (lib/tailoring/jobFit.ts) is refused with
 * 409 LOW_FIT_UNCONFIRMED until the request carries
 * `proceedDespiteLowFit: true`, the candidate's explicit "yes, apply
 * anyway" after the warning. Checked here, not only in the UI, so no AI is
 * spent on an off-scope job the candidate never confirmed. A confirmed
 * low-fit run adds the prompt's LOW-FIT rule (lead with transferable
 * strengths; every no-fabrication rule still applies).
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
    includeCoverLetter,
    coverLetterTone,
    coverLetterLength,
    coverLetterOutputLanguage,
    instructions,
    outputLanguage,
    proceedDespiteLowFit,
    unmetRequirementIds,
    useSavedWritingStyle,
  } = (body ?? {}) as {
      profileVersionId?: unknown;
      targetJobId?: unknown;
      includeCoverLetter?: unknown;
      coverLetterTone?: unknown;
      coverLetterLength?: unknown;
      /** Optional — issue #431. The candidate's own freeform steering text
       *  for this run, e.g. "emphasize my backend work". A preference
       *  signal only, fenced as DATA into the prompt — see
       *  lib/tailoring/ai/prompts.ts's HARD RULES. */
      instructions?: unknown;
      /** Optional — #641. One of OUTPUT_LANGUAGES; the language to write the
       *  generated prose in. A closed choice, validated below. */
      outputLanguage?: unknown;
      /** Optional — #642. One of OUTPUT_LANGUAGES for the cover letter;
       *  omitted, it follows the CV's `outputLanguage`. */
      coverLetterOutputLanguage?: unknown;
      /** Optional. true only after the candidate saw the low-fit warning
       *  and chose to continue. */
      proceedDespiteLowFit?: unknown;
      /** Optional — #930. Requirement ids (from job-fit) the candidate
       *  answered "no, I don't have this" to. Validated against the job's
       *  own requirements below; the CV never claims them. */
      unmetRequirementIds?: unknown;
      /** Optional — #931. false leaves the saved style notes out of this
       *  run only; the saved preferences themselves are not changed. */
      useSavedWritingStyle?: unknown;
    };
  if (typeof profileVersionId !== "string" || typeof targetJobId !== "string") {
    return NextResponse.json({ error: "profileVersionId and targetJobId are required." }, { status: 400 });
  }
  if (coverLetterTone !== undefined && !COVER_LETTER_TONES.includes(coverLetterTone as never)) {
    return NextResponse.json({ error: "Invalid coverLetterTone." }, { status: 400 });
  }
  if (coverLetterLength !== undefined && !COVER_LETTER_LENGTHS.includes(coverLetterLength as never)) {
    return NextResponse.json({ error: "Invalid coverLetterLength." }, { status: 400 });
  }
  if (instructions !== undefined && typeof instructions !== "string") {
    return NextResponse.json({ error: "Invalid instructions." }, { status: 400 });
  }
  if (outputLanguage !== undefined && !isOutputLanguage(outputLanguage)) {
    return NextResponse.json({ error: "Invalid outputLanguage." }, { status: 400 });
  }
  // #931: null is an explicit "same as the CV" for this run, which wins
  // over a saved letter language.
  if (coverLetterOutputLanguage !== undefined && coverLetterOutputLanguage !== null && !isOutputLanguage(coverLetterOutputLanguage)) {
    return NextResponse.json({ error: "Invalid coverLetterOutputLanguage." }, { status: 400 });
  }
  if (useSavedWritingStyle !== undefined && typeof useSavedWritingStyle !== "boolean") {
    return NextResponse.json({ error: "Invalid useSavedWritingStyle." }, { status: 400 });
  }
  if (typeof instructions === "string" && instructions.length > MAX_INSTRUCTIONS_CHARS) {
    return NextResponse.json({ error: `instructions must be ${MAX_INSTRUCTIONS_CHARS} characters or fewer.` }, { status: 400 });
  }

  const version = await getVersion(workspace.id, profileVersionId);
  if (!version) return NextResponse.json({ error: "Profile version not found." }, { status: 404 });

  const db = getJobmatchDb();
  const targetJob = await db.targetJob.findFirst({
    where: { id: targetJobId, workspaceId: workspace.id },
    select: { rawText: true, status: true },
  });
  if (!targetJob || targetJob.status !== "FETCHED" || !targetJob.rawText) {
    return NextResponse.json({ error: "That job has no fetched text to tailor toward." }, { status: 400 });
  }

  const profile = version.content;
  const fit = assessJobFit(profile, targetJob.rawText);
  const lowFit = fit.level === "low";
  if (lowFit && proceedDespiteLowFit !== true) {
    return NextResponse.json(
      { error: "This job looks outside your profile. Confirm that you want to tailor anyway.", code: "LOW_FIT_UNCONFIRMED", fit },
      { status: 409 },
    );
  }
  // #931: this request's choices, then the saved writing preferences, then
  // the application defaults. Read for this workspace only; a later save
  // changes future runs, never this preview's snapshot.
  const savedWriting = await getWritingPreferences(workspace.id);
  const writing = resolveWriting(
    {
      cvLanguage: isOutputLanguage(outputLanguage) ? outputLanguage : undefined,
      letterTone: coverLetterTone as CoverLetterTone | undefined,
      letterLength: coverLetterLength as CoverLetterLength | undefined,
      letterLanguage: coverLetterOutputLanguage === null ? null : isOutputLanguage(coverLetterOutputLanguage) ? coverLetterOutputLanguage : undefined,
      useSavedStyle: useSavedWritingStyle as boolean | undefined,
    },
    savedWriting?.preferences ?? null,
  );
  const cvLanguage = writing.cvLanguage.value;
  const requirements = extractRequirements(targetJob.rawText);
  const unmet = parseUnmetRequirementIds(unmetRequirementIds, requirements);
  if (unmet === null) return NextResponse.json({ error: "Invalid unmetRequirementIds." }, { status: 400 });
  // #929: only confirmed evidence for this workspace, this job or
  // background, and roles the selected profile still has. #930: the most
  // job-relevant items first, so the budget keeps what this job asks about.
  const relevance = evidenceRelevanceForJob(targetJob.rawText);
  const evidence = await loadGenerationEvidence(workspace.id, targetJobId, profile, relevance);
  const evidenceText = renderProfessionalEvidence(evidence);
  const motivationText = renderMotivationEvidence(evidence);
  // #930: relevant profile prose and job requirements instead of a prefix
  // cut, each line tagged with a stable source id the CV's claims cite.
  const selection = selectTailoringInputs({ profile, jobText: targetJob.rawText, evidence, unmetRequirementIds: unmet });
  // #928: one server-resolved context for the whole run. The CV and the
  // letter get the same note, job text and profile version from it, and
  // the preview keeps it as an immutable snapshot for generate-confirm.
  const context = resolveTailoringContext({
    workspaceId: workspace.id,
    profileVersionId,
    targetJobId,
    jobRawText: targetJob.rawText,
    instructions: typeof instructions === "string" ? instructions : null,
    lowFit,
    cvLanguage,
    coverLetter:
      includeCoverLetter === true
        ? {
            tone: writing.letterTone.value,
            length: writing.letterLength.value,
            // #642: the letter defaults to the language of the CV it's paired with.
            outputLanguage: writing.letterLanguage.value ?? undefined,
          }
        : null,
    // Only what the run sends: motivation needs a letter.
    evidenceRevisionIds: usedRevisionIds(evidence, includeCoverLetter === true),
    jobTextUsed: selection.jobTextUsed,
    selection: { version: selection.version, unmetRequirementIds: unmet, omittedSentences: selection.omittedSentences },
    preferenceRevisionId: savedWriting?.revisionId ?? null,
    writing,
  });
  const letterLanguage = context.coverLetter ? context.coverLetter.outputLanguage : null;
  // Minted up front so both provider calls' cost events can name this
  // preview as their subject and share it as their workflow id (issue
  // #586) — two separate line items, one user action.
  const previewId = randomUUID();
  const cost = { subjectType: "tailor_preview" as const, subjectId: previewId, workflowId: previewId };
  // Run sequentially, not via Promise.all (issue #526). Both calls go
  // through quota.ts's assertCanRunProviderCall, which is a plain
  // check-then-later-write against AiUsageLedger — running them
  // concurrently lets both read the same pre-spend total and both pass the
  // budget check before either records usage, spending up to roughly double
  // one call's cost past the configured ceiling. Serializing means the
  // cover-letter call's check runs after the tailor call's usage is already
  // recorded, so it sees the real, up-to-date spend.
  const tailorResult = await runTailorProviderCall(
    workspace.id,
    targetJobId,
    profile,
    targetJob.rawText,
    context.instructions,
    undefined,
    cost,
    context.cv.outputLanguage,
    context.lowFit,
    evidenceText,
    selection,
    context.writing?.cvStyleNote ?? null,
  );
  const coverLetterResult = context.coverLetter
    ? await runCoverLetterProviderCall(
        workspace.id,
        targetJobId,
        selection.plainProfileText,
        selection.jobTextUsed,
        context.coverLetter.tone,
        context.coverLetter.length,
        undefined,
        cost,
        context.coverLetter.outputLanguage,
        context.instructions,
        { evidence: evidenceText, motivation: motivationText },
        context.writing?.letterStyleNote ?? null,
      )
    : null;
  const { suggestions, degraded, promptVersion, modelVersion } = tailorResult;
  // #930: every claim checked against the sources it cites. Flags only:
  // the review shows them and starts a flagged bullet unticked.
  const claimCheck = suggestions
    ? checkClaims({ suggestions, sources: selection.sources, requirements: selection.requirements, coverage: selection.coverage, outputLanguage: context.cv.outputLanguage })
    : null;

  // The server's own record of what this preview actually did (issue #525)
  // — generate-confirm re-derives provenance from this row instead of
  // trusting promptVersion/modelVersion/degraded echoed back by the client.
  const preview = await db.tailorPreview.create({
    data: {
      id: previewId,
      workspaceId: workspace.id,
      profileVersionId,
      targetJobId,
      promptVersion,
      modelVersion,
      degraded,
      coverLetterPromptVersion: coverLetterResult?.promptVersion ?? null,
      coverLetterModelVersion: coverLetterResult?.modelVersion ?? null,
      coverLetterDegraded: coverLetterResult ? coverLetterResult.degraded : null,
      outputLanguage: cvLanguage,
      coverLetterOutputLanguage: letterLanguage,
      contextVersion: TAILORING_CONTEXT_VERSION,
      context: context as never,
      contextFingerprint: tailoringContextFingerprint(context),
      // #932: the suggestions as generated, so generate-confirm can record
      // what the candidate accepted, edited or rejected against the
      // server's copy rather than the client's.
      suggestions: suggestions ? (suggestions as never) : undefined,
      coverLetterSuggestion: coverLetterResult?.suggestion ? (coverLetterResult.suggestion as never) : undefined,
    },
    select: { id: true },
  });

  return NextResponse.json({
    previewId: preview.id,
    degraded,
    /** #756: why it degraded, and when the monthly budgets reset. Not
     *  persisted: it explains this run only, never provenance. */
    degradedReason: tailorResult.degradedReason,
    budgetResetsOn: nextMonthStart().toISOString().slice(0, 10),
    promptVersion,
    modelVersion,
    suggestions,
    instructions: context.instructions,
    outputLanguage: cvLanguage,
    lowFit,
    /** #929: how many confirmed evidence items both prompts got. */
    evidenceUsed: context.evidenceRevisionIds.length,
    /** #931: where each style setting came from, and the saved revision. */
    writing: context.writing,
    preferenceRevisionNumber: savedWriting?.revisionNumber ?? null,
    /** #930: requirement coverage, the claim check, and a label for every
     *  source id a claim may cite (the candidate's own data, not model text). */
    requirements: selection.coverage,
    claimCheck,
    sources: selection.sources.map((source) => ({ id: source.id, kind: source.kind, label: source.label })),
    coverLetter: coverLetterResult
      ? {
          suggestion: coverLetterResult.suggestion,
          degraded: coverLetterResult.degraded,
          degradedReason: coverLetterResult.degradedReason,
          outputLanguage: letterLanguage,
          promptVersion: coverLetterResult.promptVersion,
          modelVersion: coverLetterResult.modelVersion,
          removedSentences: coverLetterResult.removedSentences,
          droppedParagraphs: coverLetterResult.droppedParagraphs,
        }
      : null,
    // The candidate's real, unedited values — the review screen falls back
    // to these for anything declined, and needs them to render a
    // before/after comparison at all.
    profile: {
      fullName: profile.fullName,
      headline: profile.headline,
      summary: profile.summary,
      skills: profile.skills.map((s) => s.name),
      experience: profile.experience.map((e) => ({
        title: e.title,
        employer: e.employer,
        startedOn: e.startedOn,
        endedOn: e.endedOn,
        isCurrent: e.isCurrent,
        summary: e.summary,
      })),
    },
  });
}
