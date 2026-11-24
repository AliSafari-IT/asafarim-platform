import type { OutputLanguage } from "../tailoring/language";
import type { CoverLetterLength, CoverLetterTone, WritingPreferences } from "./contract";

/**
 * Precedence for one tailoring run (#931): what the candidate chose for
 * this application → their saved writing preferences → the application
 * default. Pure and deterministic, used by generate-preview (the
 * authoritative resolution) and by the Tailor card (to show where each
 * setting comes from). None of this ever overrides a fact rule: these are
 * style settings, and the fact boundary lives in the prompts and the merge.
 *
 * A request value equal to the saved one counts as "saved": the Tailor card
 * pre-fills saved values, so leaving a setting alone keeps its provenance.
 */

export type SettingSource = "request" | "saved" | "default";

export interface ResolvedSetting<T> {
  value: T;
  source: SettingSource;
}

export interface WritingRequest {
  cvLanguage?: OutputLanguage | null;
  letterTone?: CoverLetterTone;
  letterLength?: CoverLetterLength;
  /** null: explicitly "same as the CV" for this run; undefined: not given. */
  letterLanguage?: OutputLanguage | null;
  /** false: leave the saved style notes out of this run only. */
  useSavedStyle?: boolean;
}

export interface ResolvedWriting {
  cvLanguage: ResolvedSetting<OutputLanguage | null>;
  letterTone: ResolvedSetting<CoverLetterTone>;
  letterLength: ResolvedSetting<CoverLetterLength>;
  /** null value: the letter follows the CV's language. */
  letterLanguage: ResolvedSetting<OutputLanguage | null>;
  /** The saved notes this run uses; null when none or switched off. */
  cvStyleNote: string | null;
  letterStyleNote: string | null;
  /** "off": saved notes exist but this run leaves them out. */
  styleNotes: "saved" | "off" | "none";
}

export const WRITING_DEFAULTS = {
  cvLanguage: null,
  letterTone: "formal",
  letterLength: "standard",
  letterLanguage: null,
} as const;

function pick<T>(requested: T | undefined, saved: T | null | undefined, fallback: T): ResolvedSetting<T> {
  if (requested !== undefined) {
    return { value: requested, source: saved !== null && saved !== undefined && saved === requested ? "saved" : "request" };
  }
  if (saved !== null && saved !== undefined) return { value: saved, source: "saved" };
  return { value: fallback, source: "default" };
}

export function resolveWriting(request: WritingRequest, saved: WritingPreferences | null): ResolvedWriting {
  const hasNotes = Boolean(saved?.cv.styleNote || saved?.coverLetter.styleNote);
  const useNotes = hasNotes && request.useSavedStyle !== false;
  return {
    cvLanguage: pick<OutputLanguage | null>(request.cvLanguage, saved?.cv.outputLanguage, WRITING_DEFAULTS.cvLanguage),
    letterTone: pick<CoverLetterTone>(request.letterTone, saved?.coverLetter.tone, WRITING_DEFAULTS.letterTone),
    letterLength: pick<CoverLetterLength>(request.letterLength, saved?.coverLetter.length, WRITING_DEFAULTS.letterLength),
    // "Same as the CV" is stored as null, which is also the default, so an
    // explicit null request with nothing else saved is the default.
    letterLanguage:
      request.letterLanguage === null && !saved?.coverLetter.outputLanguage
        ? { value: null, source: "default" }
        : pick<OutputLanguage | null>(request.letterLanguage, saved?.coverLetter.outputLanguage, WRITING_DEFAULTS.letterLanguage),
    cvStyleNote: useNotes ? (saved?.cv.styleNote ?? null) : null,
    letterStyleNote: useNotes ? (saved?.coverLetter.styleNote ?? null) : null,
    styleNotes: !hasNotes ? "none" : useNotes ? "saved" : "off",
  };
}
