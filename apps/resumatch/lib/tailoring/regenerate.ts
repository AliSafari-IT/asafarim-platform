import { isOutputLanguage, type OutputLanguage } from "./language";
import { readStoredCandidateEdits, type CandidateEdits } from "./candidateEdits";
import { parseStoredTailoringContext } from "./context";
import type { CoverLetterLength, CoverLetterTone } from "./ai/coverLetter/prompts";

/**
 * "Edit and regenerate" (2026-11-21): reopening the tailoring flow from a
 * saved CV or cover letter, already pointed at the same job and with the
 * same choices the saved one was made with, so the candidate can change
 * one thing and run it again instead of starting from an empty intake.
 *
 * Regenerating never edits or replaces the saved CV/letter: it runs the
 * normal preview → review → confirm flow and saves a new pair, so the old
 * one stays in history. Tone and length of the letter come from the CV's
 * stored request context (#928); a CV saved before 0.6.0 has none, so they
 * fall back to the flow's defaults.
 *
 * The candidate's own hand edits on that CV (skills added or removed,
 * bullets they wrote; lib/tailoring/candidateEdits.ts) carry over: the AI
 * writes fresh suggestions, and the next review starts with those edits
 * already applied.
 */
export interface RegenerateSeed {
  /** The saved CV this run started from — only for the "back" link. */
  fromResumeId: string;
  job: {
    targetJobId: string;
    title: string | null;
    employer: string | null;
    snippet: string;
  };
  /** The CV's language, or null to keep the flow's own default. */
  cvLanguage: OutputLanguage | null;
  instructions: string;
  includeCoverLetter: boolean;
  /** null = "same as the CV", the flow's own meaning. */
  coverLetterLanguage: OutputLanguage | null;
  /** The letter's tone and length from the saved context; null = the
   *  flow's defaults (no letter, or a CV saved before 0.6.0). */
  coverLetterTone: CoverLetterTone | null;
  coverLetterLength: CoverLetterLength | null;
  /** The saved CV's own hand edits, put back on the next review. */
  candidateEdits: CandidateEdits;
}

export interface RegenerateSourceRow {
  id: string;
  instructions: string | null;
  outputLanguage: string | null;
  targetJob: { id: string; title: string | null; employer: string | null; rawText: string | null };
  coverLetter: { outputLanguage: string | null } | null;
  candidateEdits?: unknown;
  tailoringContext?: unknown;
}

/** Same length as every intake route's `snippet`. */
const SNIPPET_CHARS = 400;

/**
 * Builds the seed from a workspace-scoped row. `wantLetter` pre-ticks the
 * cover letter even when this CV had none ("Add a cover letter").
 */
export function buildRegenerateSeed(row: RegenerateSourceRow, wantLetter: boolean): RegenerateSeed {
  const cvLanguage = isOutputLanguage(row.outputLanguage) ? row.outputLanguage : null;
  const storedLetterLanguage = row.coverLetter?.outputLanguage;
  const letterLanguage = isOutputLanguage(storedLetterLanguage) ? storedLetterLanguage : null;
  const letterContext = parseStoredTailoringContext(row.tailoringContext)?.coverLetter ?? null;
  return {
    fromResumeId: row.id,
    job: {
      targetJobId: row.targetJob.id,
      title: row.targetJob.title,
      employer: row.targetJob.employer,
      snippet: (row.targetJob.rawText ?? "").slice(0, SNIPPET_CHARS),
    },
    cvLanguage,
    instructions: row.instructions ?? "",
    includeCoverLetter: wantLetter || row.coverLetter !== null,
    // Only a letter that really differed from the CV keeps its own
    // language; otherwise it follows the CV, as it does on a fresh run.
    coverLetterLanguage: letterLanguage && letterLanguage !== cvLanguage ? letterLanguage : null,
    coverLetterTone: letterContext?.tone ?? null,
    coverLetterLength: letterContext?.length ?? null,
    candidateEdits: readStoredCandidateEdits(row.candidateEdits),
  };
}
