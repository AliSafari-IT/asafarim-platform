import { ungroundedProseTokenCount, type ProseGroundingMode } from "../../../extraction/ai/grounding";
import { log } from "../../../observability/logger";
import { COVER_LETTER_CONVENTIONS, type OutputLanguage } from "../../language";
import type { CoverLetterSuggestion } from "./schema";

/**
 * The structural half of the cover letter's no-fabrication guarantee
 * (issue #529). The prompt's HARD RULES (prompts.ts) say the model may never
 * invent a fact; this checks the actual output, using the same notable-token
 * bar `lib/extraction/ai/grounding.ts` applies to AI-written CV prose
 * (numbers/percentages and mid-sentence proper nouns, matched
 * case-insensitively).
 *
 * **Two sources, not one.** A letter legitimately draws notable tokens from
 * the candidate's profile (employers, technologies, metrics) *and* from the
 * job posting (the hiring company, the role title, the terms the prompt
 * tells the model to echo). Every token is checked against the union of the
 * profile text and the job text the model was actually shown (both capped
 * by `renderCoverLetterPrompt`), never against either one alone.
 *
 * **What happens on a miss — the decision #529 asks for.**
 * - A **paragraph** with any ungrounded token is dropped whole, never
 *   edited. The candidate reviews the letter before approving it, so a
 *   letter missing one paragraph is still honest and still usable; throwing
 *   away the whole letter for one bad sentence would punish every honest
 *   paragraph next to it.
 * - If **no paragraph** survives, the letter is degraded: `suggestion` is
 *   `null`, exactly the shape a failed provider call already produces
 *   (`generate.ts` has no "carried over unchanged" fallback for a letter).
 * - An ungrounded **greeting** (typically an invented hiring-manager name)
 *   is replaced with the requested language's neutral salutation from
 *   `COVER_LETTER_CONVENTIONS` — the one the prompt asks for in that case
 *   anyway — rather than costing the whole letter. English when no
 *   language was requested. Same for an ungrounded **sign-off**.
 *
 * **Which tokens count.** Paragraphs use the `"prose"` mode: numbers, and
 * capitalized words that are not at a sentence start. German capitalizes
 * every noun, so a letter written in German (`outputLanguage === "de"`)
 * uses the `"headline"` mode instead — numbers plus tokens with a
 * distinctive technology shape ("Node.js", "AWS", "C#"). Known gap, accepted:
 * in German, a fabricated plain-shaped name ("Terraform", an employer) is
 * not caught; numbers and tech-shaped names are. A greeting is checked in
 * `"prose"` mode with salutation words ("Hiring", "Manager", "Herren"…)
 * allowed, so a name after "Dear Ms." is still checked. A sign-off carries
 * no facts by design (the name is added from the profile in code), so it is
 * only checked for numbers and tech-shaped tokens.
 */

/** Words that may appear capitalized in a salutation without being a fact. */
const SALUTATION_WORDS = [
  "hiring",
  "manager",
  "managers",
  "team",
  "recruiter",
  "recruiting",
  "recruitment",
  "talent",
  "acquisition",
  "hr",
  "sir",
  "madam",
  "ms",
  "mr",
  "mrs",
  "dr",
  "prof",
  "mme",
  "mlle",
  "dhr",
  "mevr",
  "heer",
  "mevrouw",
  "madame",
  "monsieur",
  "damen",
  "herren",
  "frau",
  "herr",
];

/**
 * "Dear Ms. Henderson": the shared check treats a capital after ". " as a
 * sentence start and skips it, so an honorific's dot would hide exactly the
 * name we need to check. Drop the dot before checking (never in the output).
 */
const HONORIFIC_DOT = /\b(Ms|Mr|Mrs|Dr|Prof|Mme|Mlle|Hr|Fr|Dhr|Mevr)\./g;

function ungrounded(text: string, sourceLower: string, mode: ProseGroundingMode): boolean {
  return ungroundedProseTokenCount(text.replace(HONORIFIC_DOT, "$1"), sourceLower, mode) > 0;
}

export interface CoverLetterGroundingResult {
  /** null when nothing grounded is left to review — treat as degraded. */
  suggestion: CoverLetterSuggestion | null;
  droppedParagraphs: number;
  greetingReplaced: boolean;
  signOffReplaced: boolean;
}

export function groundCoverLetterSuggestion(
  suggestion: CoverLetterSuggestion,
  profileText: string,
  jobText: string,
  outputLanguage: OutputLanguage | null,
): CoverLetterGroundingResult {
  const sourceLower = `${profileText}\n${jobText}`.toLowerCase();
  const paragraphMode: ProseGroundingMode = outputLanguage === "de" ? "headline" : "prose";
  const conventions = COVER_LETTER_CONVENTIONS[outputLanguage ?? "en"];

  const paragraphs = suggestion.paragraphs.filter((paragraph) => !ungrounded(paragraph, sourceLower, paragraphMode));
  const droppedParagraphs = suggestion.paragraphs.length - paragraphs.length;

  const greetingSource = `${sourceLower}\n${SALUTATION_WORDS.join(" ")}`;
  const greetingReplaced = ungrounded(suggestion.greeting, greetingSource, "prose");
  const signOffReplaced = ungrounded(suggestion.signOff, sourceLower, "headline");

  if (droppedParagraphs > 0 || greetingReplaced || signOffReplaced) {
    log.warn("coverLetter.ai.ungrounded", {
      // Counts and flags only — the letter text is profile-derived content.
      droppedParagraphs,
      keptParagraphs: paragraphs.length,
      greetingReplaced,
      signOffReplaced,
    });
  }

  if (paragraphs.length === 0) {
    return { suggestion: null, droppedParagraphs, greetingReplaced, signOffReplaced };
  }

  return {
    suggestion: {
      greeting: greetingReplaced ? conventions.neutralGreeting : suggestion.greeting,
      paragraphs,
      signOff: signOffReplaced ? conventions.signOff : suggestion.signOff,
    },
    droppedParagraphs,
    greetingReplaced,
    signOffReplaced,
  };
}
