import { NextResponse } from "next/server";
import { getJobmatchDb } from "../../../../../lib/db/client";
import { Prisma } from "../../../../../lib/db/generated";
import { getVersion } from "../../../../../lib/profile/versions";
import {
  mergeTailoringSuggestions,
  parseApprovedTailorSuggestions,
  parseTailoredResumeContent,
} from "../../../../../lib/tailoring/ai/schema";
import { buildCoverLetterContent } from "../../../../../lib/tailoring/ai/coverLetter/generate";
import { parseCoverLetterSuggestion } from "../../../../../lib/tailoring/ai/coverLetter/schema";
import {
  applyCandidateEdits,
  hasCandidateEdits,
  readStoredCandidateEdits,
  MAX_CV_SKILLS,
  parseCandidateEdits,
  TooManySkillsError,
} from "../../../../../lib/tailoring/candidateEdits";
import { getCurrentWorkspace, recordAuditEvent } from "../../../../../lib/workspace";
import { logError } from "../../../../../lib/observability/logger";

export const dynamic = "force-dynamic";

/**
 * "Edit" on a saved tailored CV (lib/tailoring/editSaved.ts): save the
 * review the candidate reopened, onto the same CV and letter. No AI call is
 * made and none is recorded; provenance (prompt, model, degraded, output
 * language) stays what the first save recorded.
 *
 * The same rules as generate-confirm apply: `approved` only supplies
 * wording and a skill order, and `mergeTailoringSuggestions` copies every
 * fact from the profile version this CV was made from (never the request,
 * never a newer version). Hand edits are the candidate's own claims, on
 * this CV only (lib/tailoring/candidateEdits.ts).
 *
 * PDFs made earlier are snapshots and are left alone: the CV's fingerprint
 * no longer matches them, so the page and the composer say they are older
 * than the CV (lib/documentPdfs/fingerprint.ts).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await saveEdit(request, (await params).id);
  } catch (error) {
    logError("tailoring.edit.failed", error);
    return NextResponse.json(
      { error: "Something went wrong while saving your changes. Try Save again." },
      { status: 500 },
    );
  }
}

async function saveEdit(request: Request, id: string): Promise<Response> {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { approved, candidateEdits: rawCandidateEdits, coverLetter } = body as {
    approved?: unknown;
    candidateEdits?: unknown;
    /** Absent or null: the letter (if any) stays as it is. */
    coverLetter?: { approved?: unknown } | null;
  };

  const db = getJobmatchDb();
  const row = await db.tailoredResume.findFirst({
    where: { id, workspaceId: workspace.id },
    select: {
      id: true,
      profileVersionId: true,
      targetJobId: true,
      content: true,
      skillsParagraph: true,
      candidateEdits: true,
      coverLetter: { select: { id: true } },
    },
  });
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // The facts come from the profile version this CV was made from.
  const version = await getVersion(workspace.id, row.profileVersionId);
  if (!version) return NextResponse.json({ error: "Profile version not found." }, { status: 404 });

  let suggestions;
  try {
    suggestions = parseApprovedTailorSuggestions(approved);
  } catch {
    return NextResponse.json(
      { error: "Your changes could not be saved as written. Shorten any edited text and try again." },
      { status: 422 },
    );
  }

  let candidateEdits;
  try {
    candidateEdits = parseCandidateEdits(rawCandidateEdits);
    // #964: an in-place edit has no claim check, so it keeps the claims the
    // candidate confirmed when the CV was first saved.
    const sent = rawCandidateEdits && typeof rawCandidateEdits === "object" && "confirmedClaims" in rawCandidateEdits;
    if (!sent) candidateEdits = { ...candidateEdits, confirmedClaims: readStoredCandidateEdits(row.candidateEdits).confirmedClaims };
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
    logError("tailoring.edit.merge_invalid", error, { tailoringId: row.id });
    return NextResponse.json(
      { error: "Your profile has a field this CV cannot hold (for example a very long text)." },
      { status: 422 },
    );
  }

  let letterContent = null;
  if (coverLetter && coverLetter.approved !== null && coverLetter.approved !== undefined) {
    if (!row.coverLetter) {
      return NextResponse.json({ error: "This CV has no cover letter to edit." }, { status: 400 });
    }
    try {
      letterContent = buildCoverLetterContent(parseCoverLetterSuggestion(coverLetter.approved), version.content.fullName);
    } catch {
      return NextResponse.json(
        { error: "Your cover-letter changes could not be saved as written. Shorten any edited text and try again." },
        { status: 422 },
      );
    }
  }

  // The skills paragraph was checked against the old skill list; a CV
  // whose skills changed needs a new one (the picker offers to write it).
  const previous = parseTailoredResumeContent(row.content);
  const skillsChanged = previous.skills.join("\u0000") !== content.skills.join("\u0000");

  await db.$transaction(async (tx) => {
    await tx.tailoredResume.update({
      where: { id: row.id },
      data: {
        content,
        // No hand edits left on this CV: a database NULL, as on a first save.
        candidateEdits: hasCandidateEdits(candidateEdits) ? candidateEdits : Prisma.DbNull,
        // A hand-edited paragraph goes too: it may name a skill that was
        // just taken off. The picker offers to write a new one.
        ...(skillsChanged ? { skillsParagraph: null, skillsParagraphEditedAt: null } : {}),
      },
    });
    if (letterContent && row.coverLetter) {
      await tx.coverLetter.update({ where: { id: row.coverLetter.id }, data: { content: letterContent } });
    }
  });

  await recordAuditEvent(workspace.id, "tailoring.edited", {
    tailoringId: row.id,
    targetJobId: row.targetJobId,
    coverLetterEdited: Boolean(letterContent),
  });

  return NextResponse.json({ id: row.id, coverLetterId: row.coverLetter?.id ?? null });
}
