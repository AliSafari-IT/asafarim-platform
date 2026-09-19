import { z } from "zod";

/**
 * The cover-letter contract (issue #430, part of #453). Same discipline as
 * `../schema.ts`'s tailoring contract: a provider may only ever return free
 * text under this schema, re-validated before it is trusted anywhere —
 * there is no field here a fabricated fact could hide in, because unlike
 * the tailored-resume contract there is no structured fact-carrying field
 * at all (no employer/date/skill array) for a model to get right or wrong.
 * The no-fabrication guarantee here is enforced by the prompt's HARD RULES
 * (see prompts.ts) rather than by a code-built merge step, because a letter
 * is prose through and through — there is nothing to merge it against.
 */

export const COVER_LETTER_CONTRACT_VERSION = "1.0.0";

const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const coverLetterSuggestionSchema = z.object({
  greeting: trimmed(120),
  /** 3–5 paragraphs, each free text. Ordered top to bottom. */
  paragraphs: z.array(trimmed(1200)).min(1).max(6),
  signOff: trimmed(120),
});

export type CoverLetterSuggestion = z.infer<typeof coverLetterSuggestionSchema>;

export function parseCoverLetterSuggestion(input: unknown): CoverLetterSuggestion {
  return coverLetterSuggestionSchema.parse(input);
}

export const coverLetterContentSchema = z
  .object({
    contractVersion: z.literal(COVER_LETTER_CONTRACT_VERSION).default(COVER_LETTER_CONTRACT_VERSION),
    greeting: trimmed(120),
    paragraphs: z.array(trimmed(1200)).min(1).max(6),
    signOff: trimmed(120),
    /** The candidate's own name, copied from the profile in code — never
     *  taken from provider output, same posture as the resume side's
     *  fullName field. */
    fullName: trimmed(160).nullable().default(null),
  })
  .strict();

export type CoverLetterContent = z.infer<typeof coverLetterContentSchema>;

/** Parse untrusted cover-letter content — a row read back from the
 *  database. */
export function parseCoverLetterContent(input: unknown): CoverLetterContent {
  return coverLetterContentSchema.parse(input);
}

/** Builds the persisted shape from a provider's (already-validated)
 *  suggestion plus the candidate's own confirmed name — mirrors
 *  `mergeTailoringSuggestions`'s "facts come from code, never from
 *  provider output" rule, reduced to the one fact a letter carries. */
export function buildCoverLetterContent(suggestion: CoverLetterSuggestion, fullName: string | null): CoverLetterContent {
  return coverLetterContentSchema.parse({
    greeting: suggestion.greeting,
    paragraphs: suggestion.paragraphs,
    signOff: suggestion.signOff,
    fullName,
  });
}
