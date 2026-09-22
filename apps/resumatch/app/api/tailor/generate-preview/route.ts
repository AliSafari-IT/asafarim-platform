import { NextResponse } from "next/server";
import { runTailorProviderCall } from "../../../../lib/tailoring/ai/generate";
import { MAX_INSTRUCTIONS_CHARS } from "../../../../lib/tailoring/ai/prompts";
import { runCoverLetterProviderCall } from "../../../../lib/tailoring/ai/coverLetter/generate";
import { COVER_LETTER_LENGTHS, COVER_LETTER_TONES } from "../../../../lib/tailoring/ai/coverLetter/prompts";
import { buildProfileText } from "../../../../lib/tailoring/buildProfileText";
import { getJobmatchDb } from "../../../../lib/db/client";
import { getVersion } from "../../../../lib/profile/versions";
import { getCurrentWorkspace } from "../../../../lib/workspace";

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

  const { profileVersionId, targetJobId, includeCoverLetter, coverLetterTone, coverLetterLength, instructions } =
    (body ?? {}) as {
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
    typeof instructions === "string" ? instructions : null,
  );
  const coverLetterResult =
    includeCoverLetter === true
      ? await runCoverLetterProviderCall(
          workspace.id,
          targetJobId,
          buildProfileText(profile).text,
          targetJob.rawText,
          coverLetterTone as never,
          coverLetterLength as never,
        )
      : null;
  const { suggestions, degraded, promptVersion, modelVersion } = tailorResult;

  // The server's own record of what this preview actually did (issue #525)
  // — generate-confirm re-derives provenance from this row instead of
  // trusting promptVersion/modelVersion/degraded echoed back by the client.
  const preview = await db.tailorPreview.create({
    data: {
      workspaceId: workspace.id,
      profileVersionId,
      targetJobId,
      promptVersion,
      modelVersion,
      degraded,
      coverLetterPromptVersion: coverLetterResult?.promptVersion ?? null,
      coverLetterModelVersion: coverLetterResult?.modelVersion ?? null,
      coverLetterDegraded: coverLetterResult ? coverLetterResult.degraded : null,
    },
    select: { id: true },
  });

  return NextResponse.json({
    previewId: preview.id,
    degraded,
    promptVersion,
    modelVersion,
    suggestions,
    instructions: typeof instructions === "string" ? instructions : null,
    coverLetter: coverLetterResult
      ? {
          suggestion: coverLetterResult.suggestion,
          degraded: coverLetterResult.degraded,
          promptVersion: coverLetterResult.promptVersion,
          modelVersion: coverLetterResult.modelVersion,
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
