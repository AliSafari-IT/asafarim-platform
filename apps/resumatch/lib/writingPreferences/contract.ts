import { isOutputLanguage, type OutputLanguage } from "../tailoring/language";

/**
 * The cover letter's closed tone/length choices, the same values as
 * lib/tailoring/ai/coverLetter/prompts.ts (contract.test.ts checks they
 * match). Repeated here because that module pulls in server-only provider
 * code, and this one is also read by the Tailor and Profile pages.
 */
export const COVER_LETTER_TONES = ["formal", "warm", "confident"] as const;
export type CoverLetterTone = (typeof COVER_LETTER_TONES)[number];
export const COVER_LETTER_LENGTHS = ["short", "standard", "detailed"] as const;
export type CoverLetterLength = (typeof COVER_LETTER_LENGTHS)[number];

/**
 * Saved writing preferences (#931): the candidate's own reusable defaults
 * for how ResuMatch writes, kept apart for the CV and the cover letter.
 *
 * - Every field is optional. Null means "not set": the run uses the
 *   application default (or what the candidate picks for that run).
 * - Closed choices (language, tone, length) plus one short style note per
 *   artifact. A style note steers wording and emphasis only. It is never a
 *   fact: `factualStyleIssue` refuses notes that read like one, and the
 *   prompts fence the note as a lower-priority preference signal.
 * - Nothing is ever saved implicitly. Only the candidate's explicit
 *   "Remember" or "Save" writes a revision (lib/writingPreferences/store.ts).
 */

export const WRITING_PREFERENCES_VERSION = "writing_preferences@1";

/** A style note is a short steer, not a paragraph. */
export const MAX_STYLE_NOTE_CHARS = 300;

export interface CvWritingPreferences {
  outputLanguage: OutputLanguage | null;
  styleNote: string | null;
}

export interface CoverLetterWritingPreferences {
  tone: CoverLetterTone | null;
  length: CoverLetterLength | null;
  /** Null: the letter follows the CV's language. */
  outputLanguage: OutputLanguage | null;
  styleNote: string | null;
}

export interface WritingPreferences {
  cv: CvWritingPreferences;
  coverLetter: CoverLetterWritingPreferences;
}

export const EMPTY_WRITING_PREFERENCES: WritingPreferences = {
  cv: { outputLanguage: null, styleNote: null },
  coverLetter: { tone: null, length: null, outputLanguage: null, styleNote: null },
};

export function isEmptyWritingPreferences(prefs: WritingPreferences): boolean {
  return (
    prefs.cv.outputLanguage === null &&
    prefs.cv.styleNote === null &&
    prefs.coverLetter.tone === null &&
    prefs.coverLetter.length === null &&
    prefs.coverLetter.outputLanguage === null &&
    prefs.coverLetter.styleNote === null
  );
}

export function sameWritingPreferences(a: WritingPreferences, b: WritingPreferences): boolean {
  return JSON.stringify(normalizeOrder(a)) === JSON.stringify(normalizeOrder(b));
}

function normalizeOrder(p: WritingPreferences): unknown[] {
  return [
    p.cv.outputLanguage,
    p.cv.styleNote,
    p.coverLetter.tone,
    p.coverLetter.length,
    p.coverLetter.outputLanguage,
    p.coverLetter.styleNote,
  ];
}

/**
 * Patterns that make a style note read as a statement of fact about the
 * candidate: years of experience, first-person claims of having done,
 * held or known something, or contact details. Deterministic and
 * deliberately conservative: a note such as "lead with my backend work"
 * (emphasis on facts already in the profile) passes; "say I have 8 years
 * of Kubernetes" does not. Covers the four output languages.
 */
const FACT_PATTERNS: RegExp[] = [
  // "5 years", "10+ yrs", "3 jaar", "4 ans", "6 Jahre"
  /\b\d+\s*\+?\s*(years?|yrs?|jaar|jaren|ans?|années?|jahre?n?)\b/iu,
  // English first-person claims
  /\b(i|we)\s+(have|had|hold|held|am|was|were|worked|work|led|lead|managed|manage|built|build|founded|speak|studied|graduated|earned|won|know|did|own)\b/iu,
  /\b(i've|i'm|i'd)\b/iu,
  /\bmy\s+(degree|diploma|employer|salary|certificat\w*|licen[cs]e|qualification\w*)\b/iu,
  // "say/claim/write that I…", "add … to my skills"
  /\b(say|claim|write|state|pretend)\s+(that\s+)?(i|my|me)\b/iu,
  /\badd\b.{0,40}\bto\s+my\s+(skills|experience|profile|cv|resume)\b/iu,
  /\b(worked|working)\s+(at|for)\b/iu,
  // Dutch, French, German first person
  /\bik\s+(heb|had|ben|was|werkte|werk|leidde|beheerde|spreek|studeerde)\b/iu,
  /\b(j'ai|je suis|j'étais|j'avais|je parle|j'ai travaillé)\b/iu,
  /\bich\s+(habe|hatte|bin|war|arbeite|arbeitete|leitete|spreche|studierte)\b/iu,
  // Contact details and links never belong in a style note.
  /[^\s@]+@[^\s@]+\.[a-z]{2,}/iu,
  /\bhttps?:\/\//iu,
  /\+?\d[\d\s().-]{7,}\d/u,
];

/** Null when the note reads as style only; "fact_like" when it reads as a
 *  claim about the candidate (which belongs in the profile or evidence). */
export function factualStyleIssue(note: string): "fact_like" | null {
  return FACT_PATTERNS.some((pattern) => pattern.test(note)) ? "fact_like" : null;
}

export type WritingPreferencesError =
  | "invalid"
  | "cv_language"
  | "letter_tone"
  | "letter_length"
  | "letter_language"
  | "style_note_too_long"
  | "style_note_factual";

export type WritingPreferencesField = "cv.styleNote" | "coverLetter.styleNote";

export type ParseResult =
  | { ok: true; value: WritingPreferences }
  | { ok: false; error: WritingPreferencesError; field?: WritingPreferencesField };

function normalizeNote(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : null;
}

/**
 * Strict parse of preferences a client sent. Closed choices must be known
 * values or null; style notes are trimmed, collapsed, capped and refused
 * when they read like a fact.
 */
export function parseWritingPreferences(raw: unknown): ParseResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "invalid" };
  const body = raw as Record<string, unknown>;
  const cv = (body.cv ?? {}) as Record<string, unknown>;
  const letter = (body.coverLetter ?? {}) as Record<string, unknown>;
  if (typeof cv !== "object" || Array.isArray(cv) || typeof letter !== "object" || Array.isArray(letter)) {
    return { ok: false, error: "invalid" };
  }

  const cvLanguage = cv.outputLanguage ?? null;
  if (cvLanguage !== null && !isOutputLanguage(cvLanguage)) return { ok: false, error: "cv_language" };
  const tone = letter.tone ?? null;
  if (tone !== null && !COVER_LETTER_TONES.includes(tone as never)) return { ok: false, error: "letter_tone" };
  const length = letter.length ?? null;
  if (length !== null && !COVER_LETTER_LENGTHS.includes(length as never)) return { ok: false, error: "letter_length" };
  const letterLanguage = letter.outputLanguage ?? null;
  if (letterLanguage !== null && !isOutputLanguage(letterLanguage)) return { ok: false, error: "letter_language" };

  const notes: [WritingPreferencesField, unknown][] = [
    ["cv.styleNote", cv.styleNote],
    ["coverLetter.styleNote", letter.styleNote],
  ];
  const parsedNotes: (string | null)[] = [];
  for (const [field, value] of notes) {
    const note = normalizeNote(value);
    if (note === undefined) return { ok: false, error: "invalid", field };
    if (note !== null && note.length > MAX_STYLE_NOTE_CHARS) return { ok: false, error: "style_note_too_long", field };
    if (note !== null && factualStyleIssue(note)) return { ok: false, error: "style_note_factual", field };
    parsedNotes.push(note);
  }

  return {
    ok: true,
    value: {
      cv: { outputLanguage: cvLanguage as OutputLanguage | null, styleNote: parsedNotes[0] ?? null },
      coverLetter: {
        tone: tone as CoverLetterTone | null,
        length: length as CoverLetterLength | null,
        outputLanguage: letterLanguage as OutputLanguage | null,
        styleNote: parsedNotes[1] ?? null,
      },
    },
  };
}

/**
 * Lenient read of stored content: anything unknown becomes "not set", so a
 * revision written by an older or newer version still reads. Stored notes
 * were checked when saved and are not re-refused here, only capped.
 */
export function readWritingPreferences(stored: unknown): WritingPreferences {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return EMPTY_WRITING_PREFERENCES;
  const body = stored as Record<string, unknown>;
  const cv = (body.cv && typeof body.cv === "object" ? body.cv : {}) as Record<string, unknown>;
  const letter = (body.coverLetter && typeof body.coverLetter === "object" ? body.coverLetter : {}) as Record<string, unknown>;
  const note = (value: unknown) => {
    const n = normalizeNote(value);
    return n ? n.slice(0, MAX_STYLE_NOTE_CHARS) : null;
  };
  return {
    cv: {
      outputLanguage: isOutputLanguage(cv.outputLanguage) ? cv.outputLanguage : null,
      styleNote: note(cv.styleNote),
    },
    coverLetter: {
      tone: COVER_LETTER_TONES.includes(letter.tone as never) ? (letter.tone as CoverLetterTone) : null,
      length: COVER_LETTER_LENGTHS.includes(letter.length as never) ? (letter.length as CoverLetterLength) : null,
      outputLanguage: isOutputLanguage(letter.outputLanguage) ? letter.outputLanguage : null,
      styleNote: note(letter.styleNote),
    },
  };
}

/** What the API and pages hand around: the current revision, or null when
 *  the candidate never saved (or deleted) their preferences. */
export interface WritingPreferencesView {
  revisionId: string;
  revisionNumber: number;
  savedAt: string;
  preferences: WritingPreferences;
}
