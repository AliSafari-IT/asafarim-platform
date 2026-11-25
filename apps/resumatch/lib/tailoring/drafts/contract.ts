import { z } from "zod";
import { OUTPUT_LANGUAGES, type OutputLanguage } from "../language";
import { COVER_LETTER_LENGTHS, COVER_LETTER_TONES } from "../../writingPreferences/contract";

/**
 * Tailor drafts: an unfinished Tailor run kept on the server, so leaving
 * /tailor or reloading it never loses a fetched job or the choices made
 * on it (`tailor_drafts`, lib/tailoring/drafts/store.ts).
 *
 * - A draft is opened by the intake route the moment a job lands (fetched,
 *   pasted, emailed, uploaded or typed in), in the same request, so a
 *   candidate who navigates away while a slow fetch runs still finds it.
 * - The page saves the options card and the review as the candidate works
 *   (debounced, and once more when the page is hidden).
 * - Saving the CV deletes the draft; so does "Discard". The job row itself
 *   stays, as it always has.
 * - Resuming never refetches the job and never calls the AI: the review
 *   comes back exactly as it was left, and is only offered while its
 *   preview can still be saved.
 *
 * Client-safe: no server imports. The Tailor page and the API route both
 * read these shapes.
 */

/** A draft untouched this long is deleted by the retention sweep. Same
 *  window as previews, whose suggestions a review draft holds a copy of. */
export const DRAFT_RETENTION_DAYS = 30;

/** Pasting a URL fetched this recently reuses that job instead of fetching
 *  (and paying for) it again. "Fetch again" always fetches. */
export const REUSE_FETCH_DAYS = 7;

/** A review draft is the candidate's own edits on a few dozen bullets;
 *  anything larger is not a review. */
export const MAX_DRAFT_REVIEW_BYTES = 256 * 1024;

/** Unfinished jobs listed on /tailor. */
export const MAX_LISTED_DRAFTS = 10;

/** Mirrors the options card's note limit (MAX_INSTRUCTIONS_CHARS). */
const MAX_INSTRUCTIONS_CHARS = 1000;

export const DRAFT_STEPS = ["options", "review"] as const;
export type DraftStep = (typeof DRAFT_STEPS)[number];

export const draftOptionsSchema = z
  .object({
    cvLanguage: z.enum(OUTPUT_LANGUAGES),
    instructions: z.string().max(MAX_INSTRUCTIONS_CHARS),
    includeCoverLetter: z.boolean(),
    coverLetterTone: z.enum(COVER_LETTER_TONES),
    coverLetterLength: z.enum(COVER_LETTER_LENGTHS),
    /** Null: the letter follows the CV's language. */
    coverLetterLanguage: z.enum(OUTPUT_LANGUAGES).nullable(),
    /** "Don't use my saved style notes" for this job. */
    savedNotesOff: z.boolean(),
    /** The candidate's "tailor anyway" on a low-fit job. */
    lowFitConfirmed: z.boolean(),
    /** Requirement questions answered "No". */
    unmetRequirementIds: z.array(z.string().min(1).max(120)).max(50),
  })
  .strict();

export type DraftOptions = z.infer<typeof draftOptionsSchema>;

export const draftUpdateSchema = z
  .object({
    step: z.enum(DRAFT_STEPS),
    options: draftOptionsSchema.nullable(),
    previewId: z.string().min(1).max(100).nullable(),
    review: z.record(z.string(), z.unknown()).nullable(),
  })
  .strict()
  .refine((u) => (u.step === "review" ? u.previewId !== null && u.review !== null : u.review === null), {
    message: "A review draft needs its preview and review; an options draft has neither review.",
  });

export type DraftUpdate = z.infer<typeof draftUpdateSchema>;

export type DraftUpdateResult = { ok: true; value: DraftUpdate } | { ok: false; error: string };

/** Validates a PUT body, including the review's size. */
export function parseDraftUpdate(body: unknown): DraftUpdateResult {
  const parsed = draftUpdateSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: "Invalid draft." };
  if (parsed.data.review && JSON.stringify(parsed.data.review).length > MAX_DRAFT_REVIEW_BYTES) {
    return { ok: false, error: "This review is too large to keep as a draft." };
  }
  return { ok: true, value: parsed.data };
}

/** Stored options read back; anything that no longer validates is dropped
 *  (the card then starts from the usual defaults). */
export function parseStoredOptions(value: unknown): DraftOptions | null {
  const parsed = draftOptionsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** The draft the Tailor page resumes. */
export interface TailorDraftView {
  targetJobId: string;
  /** The pasted URL, for the URL field; null for the other intake paths. */
  sourceUrl: string | null;
  title: string | null;
  employer: string | null;
  snippet: string;
  fetchedAt: string;
  updatedAt: string;
  step: DraftStep;
  options: DraftOptions | null;
  previewId: string | null;
  /** The review as the candidate left it (the Tailor page's own shape). */
  review: Record<string, unknown> | null;
  /** The draft was on the review, but its preview was used or deleted:
   *  it resumes on the options card and says so. */
  reviewExpired: boolean;
}

/** One row of "Unfinished jobs". */
export interface TailorDraftSummary {
  targetJobId: string;
  title: string | null;
  employer: string | null;
  step: DraftStep;
  updatedAt: string;
}

export type { OutputLanguage };
