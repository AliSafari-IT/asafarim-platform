import type { CoverLetterContent } from "./ai/coverLetter/schema";
import type { CoverLetterLength } from "./ai/coverLetter/prompts";

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
   *  the greeting isn't the honest "Dear Hiring Manager" fallback either —
   *  i.e. it looks like it was supposed to be filled in but wasn't. */
  greetingLooksIntentional: boolean;
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
const GENERIC_PHRASES = [
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

const NEUTRAL_GREETINGS = ["dear hiring manager", "dear hiring team", "dear recruiting team", "dear recruiter"];

export function computeCoverLetterQuality(
  content: CoverLetterContent,
  targetLength: CoverLetterLength = "standard",
): CoverLetterQualityReport {
  const fullText = [content.greeting, ...content.paragraphs, content.signOff].join(" ");
  const wordCount = fullText.trim().split(/\s+/).filter(Boolean).length;
  const paragraphCount = content.paragraphs.length;

  const range = WORD_COUNT_TARGETS[targetLength];
  const wordCountInRange = wordCount >= range.min && wordCount <= range.max;

  const lowerFullText = fullText.toLowerCase();
  const genericPhrasesFound = GENERIC_PHRASES.filter((phrase) => lowerFullText.includes(phrase));

  const hasUnfilledPlaceholder = [content.greeting, ...content.paragraphs, content.signOff].some((text) =>
    PLACEHOLDER_PATTERN.test(text),
  );

  const normalizedGreeting = content.greeting.trim().toLowerCase().replace(/[,:]$/, "");
  const greetingLooksIntentional =
    NEUTRAL_GREETINGS.some((neutral) => normalizedGreeting.includes(neutral)) ||
    // A named greeting ("Dear Jane Smith,") is intentional as long as it
    // isn't ALSO carrying a leftover placeholder — that case is already
    // caught by hasUnfilledPlaceholder above.
    !PLACEHOLDER_PATTERN.test(content.greeting);

  return {
    wordCount,
    paragraphCount,
    wordCountInRange,
    genericPhrasesFound,
    hasUnfilledPlaceholder,
    greetingLooksIntentional,
    hasSignerName: Boolean(content.fullName),
  };
}
