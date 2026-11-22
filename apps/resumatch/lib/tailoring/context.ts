import { createHash } from "node:crypto";
import { capWithMarker, cap } from "../ai/promptKit";
import { COVER_LETTER_LENGTHS, COVER_LETTER_TONES, type CoverLetterLength, type CoverLetterTone } from "./ai/coverLetter/prompts";
import { MAX_INSTRUCTIONS_CHARS, MAX_JOB_CHARS } from "./ai/prompts";
import { isOutputLanguage, type OutputLanguage } from "./language";

/**
 * The request context of one tailoring run (#928): everything that decides
 * what the CV and the cover letter say, resolved once on the server and
 * shared by both provider calls.
 *
 * - Built only from records the server loaded for this workspace and from
 *   closed choices it validated. The client never sends a context.
 * - Stored as an immutable snapshot on the `TailorPreview` (and, without the
 *   job text copy, on the saved `TailoredResume`). `generate-confirm` takes
 *   provenance from that snapshot and refuses a preview whose job text or
 *   options no longer match it.
 * - Additive and versioned. A legacy row has no snapshot; every reader
 *   treats that as "use the old behaviour", and optional fields missing from
 *   an older snapshot fall back to the defaults they always had.
 *
 * `evidenceRevisionIds` (#929) names the confirmed evidence revisions both
 * prompts got, in prompt order. `preferenceRevisionId` (#931) stays null
 * until that issue lands; it is part of the contract so the fingerprint
 * already covers it.
 */

export const TAILORING_CONTEXT_VERSION = "tailoring_context@1";

export interface TailoringCoverLetterContext {
  outputLanguage: OutputLanguage | null;
  tone: CoverLetterTone;
  length: CoverLetterLength;
}

export interface TailoringContext {
  version: string;
  workspaceId: string;
  profileVersionId: string;
  targetJobId: string;
  /** sha256 of the job's full fetched text at preview time. */
  jobTextFingerprint: string;
  /** The capped job text both prompts saw. Kept on the preview so it can be
   *  explained later (a hash cannot reproduce mutable job text); null on the
   *  copy stored with a saved CV, whose job row already holds the text. */
  jobTextUsed: string | null;
  /** The candidate's note for this application, trimmed and capped. It
   *  steers the CV and the letter alike, and never overrides a fact rule. */
  instructions: string | null;
  /** The candidate confirmed a job the fit check rated low. */
  lowFit: boolean;
  cv: { outputLanguage: OutputLanguage | null };
  /** Null when no letter was requested. */
  coverLetter: TailoringCoverLetterContext | null;
  preferenceRevisionId: string | null;
  /** The confirmed evidence revisions both prompts got (#929). Revisions
   *  are immutable, so these ids explain a saved CV for good. */
  evidenceRevisionIds: string[];
}

export interface ResolveTailoringContextInput {
  workspaceId: string;
  profileVersionId: string;
  targetJobId: string;
  /** The job's full fetched text, loaded by the server for this workspace. */
  jobRawText: string;
  instructions: string | null | undefined;
  lowFit: boolean;
  cvLanguage: OutputLanguage | null;
  coverLetter: {
    tone?: CoverLetterTone;
    length?: CoverLetterLength;
    /** Omitted: the letter follows the CV's language (#642). */
    outputLanguage?: OutputLanguage | null;
  } | null;
  /** #929: from lib/evidence/store.ts's loadGenerationEvidence. */
  evidenceRevisionIds?: string[];
}

export function fingerprintJobText(rawText: string): string {
  return createHash("sha256").update(rawText).digest("hex");
}

export function normalizeInstructions(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? cap(trimmed, MAX_INSTRUCTIONS_CHARS) : null;
}

export function resolveTailoringContext(input: ResolveTailoringContextInput): TailoringContext {
  return {
    version: TAILORING_CONTEXT_VERSION,
    workspaceId: input.workspaceId,
    profileVersionId: input.profileVersionId,
    targetJobId: input.targetJobId,
    jobTextFingerprint: fingerprintJobText(input.jobRawText),
    jobTextUsed: capWithMarker(input.jobRawText, MAX_JOB_CHARS),
    instructions: normalizeInstructions(input.instructions),
    lowFit: input.lowFit,
    cv: { outputLanguage: input.cvLanguage },
    coverLetter: input.coverLetter
      ? {
          outputLanguage:
            input.coverLetter.outputLanguage === undefined ? input.cvLanguage : input.coverLetter.outputLanguage,
          tone: input.coverLetter.tone ?? "formal",
          length: input.coverLetter.length ?? "standard",
        }
      : null,
    preferenceRevisionId: null,
    evidenceRevisionIds: [...(input.evidenceRevisionIds ?? [])],
  };
}

/**
 * A stable hash of every output-affecting field, workspace included. Two
 * runs share a fingerprint only when the same workspace asked for the same
 * thing against the same job text and profile version. The job text copy
 * itself is left out: its fingerprint already stands for it.
 */
export function tailoringContextFingerprint(context: TailoringContext): string {
  const parts = [
    context.version,
    context.workspaceId,
    context.profileVersionId,
    context.targetJobId,
    context.jobTextFingerprint,
    context.instructions ?? "",
    context.lowFit ? "low-fit" : "-",
    context.cv.outputLanguage ?? "-",
    context.coverLetter
      ? `${context.coverLetter.outputLanguage ?? "-"}/${context.coverLetter.tone}/${context.coverLetter.length}`
      : "no-letter",
    context.preferenceRevisionId ?? "-",
    [...context.evidenceRevisionIds].sort().join(","),
  ];
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

/** The copy kept with a saved CV: the same context without the job text. */
export function contextForSavedCv(context: TailoringContext): TailoringContext {
  return { ...context, jobTextUsed: null };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Reads a stored snapshot. Null for a legacy row (no snapshot) or anything
 * that is not a context at all. Optional fields an older snapshot lacks get
 * the defaults the flow always used, so an old row still reads.
 */
export function parseStoredTailoringContext(value: unknown): TailoringContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const version = stringOrNull(raw.version);
  const workspaceId = stringOrNull(raw.workspaceId);
  const profileVersionId = stringOrNull(raw.profileVersionId);
  const targetJobId = stringOrNull(raw.targetJobId);
  const jobTextFingerprint = stringOrNull(raw.jobTextFingerprint);
  if (!version?.startsWith("tailoring_context@") || !workspaceId || !profileVersionId || !targetJobId || !jobTextFingerprint) {
    return null;
  }
  const cv = (raw.cv ?? {}) as Record<string, unknown>;
  const letter = raw.coverLetter as Record<string, unknown> | null | undefined;
  return {
    version,
    workspaceId,
    profileVersionId,
    targetJobId,
    jobTextFingerprint,
    jobTextUsed: stringOrNull(raw.jobTextUsed),
    instructions: normalizeInstructions(stringOrNull(raw.instructions)),
    lowFit: raw.lowFit === true,
    cv: { outputLanguage: isOutputLanguage(cv.outputLanguage) ? cv.outputLanguage : null },
    coverLetter:
      letter && typeof letter === "object"
        ? {
            outputLanguage: isOutputLanguage(letter.outputLanguage) ? letter.outputLanguage : null,
            tone: COVER_LETTER_TONES.includes(letter.tone as never) ? (letter.tone as CoverLetterTone) : "formal",
            length: COVER_LETTER_LENGTHS.includes(letter.length as never) ? (letter.length as CoverLetterLength) : "standard",
          }
        : null,
    preferenceRevisionId: stringOrNull(raw.preferenceRevisionId),
    evidenceRevisionIds: Array.isArray(raw.evidenceRevisionIds)
      ? raw.evidenceRevisionIds.filter((id): id is string => typeof id === "string")
      : [],
  };
}

export type StaleContextReason = "workspace" | "profile_version" | "job" | "job_text" | "instructions" | "evidence";

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sorted = [...b].sort();
  return [...a].sort().every((id, index) => id === sorted[index]);
}

/**
 * Why a stored preview context can no longer back a save, or null when it
 * still matches. The profile version must be the one the preview used and
 * still the confirmed one (the server's record, not the client's echo). `instructions` is only compared when the client sent one:
 * the review echoes the preview's note back, so a different note means the
 * candidate changed the request after generating. `evidenceRevisionIds`
 * (#929) is the confirmed evidence a run would use now; a different set
 * means evidence was added, edited, confirmed or deleted since.
 */
export function staleContextReason(
  context: TailoringContext,
  current: {
    workspaceId: string;
    profileVersionId: string;
    targetJobId: string;
    jobRawText: string | null;
    instructions?: string | null;
    /** Whether `profileVersionId` is still the profile's confirmed version.
     *  The tailor flow always generates from the confirmed version, so a
     *  preview made before the candidate confirmed a newer one is stale. */
    profileVersionConfirmed: boolean;
    evidenceRevisionIds?: string[];
  },
): StaleContextReason | null {
  if (context.workspaceId !== current.workspaceId) return "workspace";
  if (context.profileVersionId !== current.profileVersionId || !current.profileVersionConfirmed) return "profile_version";
  if (context.targetJobId !== current.targetJobId) return "job";
  if (current.jobRawText === null || fingerprintJobText(current.jobRawText) !== context.jobTextFingerprint) {
    return "job_text";
  }
  if (current.instructions !== undefined && normalizeInstructions(current.instructions) !== context.instructions) {
    return "instructions";
  }
  if (current.evidenceRevisionIds !== undefined && !sameIds(context.evidenceRevisionIds, current.evidenceRevisionIds)) {
    return "evidence";
  }
  return null;
}
