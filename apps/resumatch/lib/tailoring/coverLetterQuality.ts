import type { CoverLetterContent } from "./ai/coverLetter/schema";
import type { CoverLetterLength } from "./ai/coverLetter/prompts";
import { OUTPUT_LANGUAGES, isOutputLanguage, type OutputLanguage } from "./language";

/**
 * Deterministic cover-letter quality checks (issue #456). Same posture as
 * lib/tailoring/quality.ts's CV checklist: no provider call, no
 * persistence, no JM-005 gate — pure functions over an already-generated
 * `CoverLetterContent`, rendered as a checklist (not a score) so the
 * candidate sees what to fix while still on the review screen (#454),
 * before anything is saved.
 */

export interface CoverLetterQualityReport {
  wordCount: number;
  paragraphCount: number;
  /** Whether wordCount falls inside the target range for the requested
   *  length (#455) — too short reads lazy, too long won't be read. */
  wordCountInRange: boolean;
  /** The specific clichés found, verbatim as matched — every ATS-writing
   *  guide tells candidates to avoid these, and they're cheap to catch
   *  without a model. */
  genericPhrasesFound: string[];
  /** True if a literal unfilled template placeholder like "[Company Name]"
   *  leaked into the greeting, a paragraph, or the sign-off. */
  hasUnfilledPlaceholder: boolean;
  /** False only when the job/profile data gave no real recipient name and
   *  the greeting isn't the honest no-name fallback either ("Dear Hiring
   *  Manager", or the letter language's own, e.g. "Madame, Monsieur," —
   *  #642) — i.e. it looks like it was supposed to be filled in but wasn't. */
  greetingLooksIntentional: boolean;
  /** #642. Null when the letter has no non-English language to check
   *  against (older letters, English ones). False when the greeting or the
   *  sign-off opens with another language's salutation or closing formula
   *  — e.g. "Dear Hiring Manager," or "Sincerely," left in a French letter,
   *  the usual sign the model slipped back into English. */
  greetingMatchesLanguage: boolean | null;
  /** False when the confirmed profile has no name to sign with — nothing
   *  in the letter itself is wrong, but the candidate should add one
   *  before sending. */
  hasSignerName: boolean;
}

const WORD_COUNT_TARGETS: Record<CoverLetterLength, { min: number; max: number }> = {
  short: { min: 60, max: 200 },
  standard: { min: 120, max: 350 },
  detailed: { min: 220, max: 550 },
};

// A small, deliberately non-exhaustive denylist of the clichés every
// ATS-writing guide flags — not a style linter, just the handful of
// phrases so common they read as templated rather than considered.
const GENERIC_PHRASES_EN = [
  "i am writing to express my interest",
  "i am writing to apply",
  "team player",
  "results-driven",
  "results driven",
  "hard worker",
  "think outside the box",
  "hit the ground running",
  "wear many hats",
  "go-getter",
  "synergy",
  "to whom it may concern",
];

const PLACEHOLDER_PATTERN = /\[[^\]]{1,60}\]|\{[^}]{1,60}\}/;

/**
 * Per-language lists (#642), lower-cased. Each language adds its own to the
 * English list, which is always checked — a letter with no recorded
 * language (older letters) is judged exactly as before, and an English
 * cliché left in a translated letter is still worth flagging.
 */
const GENERIC_PHRASES: Record<OutputLanguage, string[]> = {
  en: GENERIC_PHRASES_EN,
  nl: ["hierbij solliciteer ik", "met veel interesse las ik", "teamspeler", "resultaatgericht", "stressbestendig", "aan wie dit aangaat"],
  fr: ["je me permets de vous écrire", "suite à votre annonce", "esprit d’équipe", "esprit d'équipe", "force de proposition", "à qui de droit"],
  de: ["hiermit bewerbe ich mich", "mit großem interesse habe ich", "teamplayer", "belastbar und flexibel", "über den tellerrand"],
};

/** Honest no-name greetings, lower-cased, without trailing punctuation.
 *  "Madame, Monsieur," is the French neutral greeting, not a placeholder
 *  that was never filled in. */
const NEUTRAL_GREETINGS: Record<OutputLanguage, string[]> = {
  en: ["dear hiring manager", "dear hiring team", "dear recruiting team", "dear recruiter"],
  nl: ["geachte heer/mevrouw", "geachte heer, mevrouw", "geachte mevrouw/heer", "geachte heer of mevrouw", "geachte recruiter", "beste recruiter", "geachte selectiecommissie"],
  fr: ["madame, monsieur", "madame, messieurs", "madame ou monsieur", "monsieur, madame", "madame/monsieur"],
  de: ["sehr geehrte damen und herren", "sehr geehrtes recruiting-team", "sehr geehrtes personalteam"],
};

/** How a salutation / closing formula opens in each language, lower-cased.
 *  Deliberately only unambiguous openers ("Hallo" is Dutch and German, so
 *  it's left out): a greeting that opens with none of these proves
 *  nothing either way and isn't flagged. */
const GREETING_OPENERS: Record<OutputLanguage, string[]> = {
  en: ["dear ", "to whom it may concern", "hello "],
  nl: ["geachte ", "beste "],
  fr: ["madame", "monsieur", "messieurs", "chère ", "cher ", "bonjour"],
  de: ["sehr geehrte", "liebe ", "lieber ", "guten tag"],
};

const SIGN_OFF_OPENERS: Record<OutputLanguage, string[]> = {
  en: ["sincerely", "yours sincerely", "yours faithfully", "kind regards", "best regards", "warm regards", "regards", "best,"],
  nl: ["met vriendelijke groet", "hoogachtend", "vriendelijke groeten", "met hartelijke groet"],
  fr: ["veuillez agréer", "je vous prie d", "cordialement", "bien cordialement", "bien à vous", "salutations"],
  de: ["mit freundlichen grüßen", "mit freundlichen grüssen", "freundliche grüße", "beste grüße", "hochachtungsvoll", "viele grüße"],
};

function opensWithOtherLanguage(
  text: string,
  openers: Record<OutputLanguage, string[]>,
  language: OutputLanguage,
): boolean {
  const lower = text.trim().toLowerCase();
  const opens = (code: OutputLanguage) => openers[code].some((opener) => lower.startsWith(opener));
  if (opens(language)) return false;
  return OUTPUT_LANGUAGES.some((code) => code !== language && opens(code));
}

function forLanguage(lists: Record<OutputLanguage, string[]>, language: string | null | undefined): string[] {
  if (!isOutputLanguage(language) || language === "en") return lists.en;
  return [...lists.en, ...lists[language]];
}

export function computeCoverLetterQuality(
  content: CoverLetterContent,
  targetLength: CoverLetterLength = "standard",
  /** #642: the letter's output language; null/omitted is English. */
  language: string | null = null,
): CoverLetterQualityReport {
  const fullText = [content.greeting, ...content.paragraphs, content.signOff].join(" ");
  const wordCount = fullText.trim().split(/\s+/).filter(Boolean).length;
  const paragraphCount = content.paragraphs.length;

  const range = WORD_COUNT_TARGETS[targetLength];
  const wordCountInRange = wordCount >= range.min && wordCount <= range.max;

  const lowerFullText = fullText.toLowerCase();
  const genericPhrasesFound = forLanguage(GENERIC_PHRASES, language).filter((phrase) => lowerFullText.includes(phrase));

  const hasUnfilledPlaceholder = [content.greeting, ...content.paragraphs, content.signOff].some((text) =>
    PLACEHOLDER_PATTERN.test(text),
  );

  const normalizedGreeting = content.greeting.trim().toLowerCase().replace(/[,:]$/, "");
  const greetingLooksIntentional =
    forLanguage(NEUTRAL_GREETINGS, language).some((neutral) => normalizedGreeting.includes(neutral)) ||
    // A named greeting ("Dear Jane Smith,") is intentional as long as it
    // isn't ALSO carrying a leftover placeholder — that case is already
    // caught by hasUnfilledPlaceholder above.
    !PLACEHOLDER_PATTERN.test(content.greeting);

  const greetingMatchesLanguage =
    isOutputLanguage(language) && language !== "en"
      ? !opensWithOtherLanguage(content.greeting, GREETING_OPENERS, language) &&
        !opensWithOtherLanguage(content.signOff, SIGN_OFF_OPENERS, language)
      : null;

  return {
    wordCount,
    paragraphCount,
    wordCountInRange,
    genericPhrasesFound,
    hasUnfilledPlaceholder,
    greetingLooksIntentional,
    greetingMatchesLanguage,
    hasSignerName: Boolean(content.fullName),
  };
}
