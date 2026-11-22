import { ungroundedProseTokenCount, type ProseGroundingMode } from "../../../extraction/ai/grounding";
import { log } from "../../../observability/logger";
import { COVER_LETTER_CONVENTIONS, type OutputLanguage } from "../../language";
import type { CoverLetterSuggestion } from "./schema";
import { claimEvidence, stripUnbackedClaims } from "./claims";
import { sourceCasing } from "../sourceCasing";

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
 * full profile text and the full job text, never against either one alone.
 * Full, not the prompt's capped copies: a token found anywhere in either
 * source is a real fact, not a fabrication, and the fixture provider builds
 * its letter from the uncapped profile text.
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
 * no name by design (the candidate's name is added from the profile in
 * code): any language's conventional closing is accepted as is; anything
 * else is checked the same way as a greeting, so an invented signature
 * ("Regards, John Smith") is replaced.
 *
 * **Claims, not just tokens.** Before the token check, `claims.ts` removes
 * any *sentence* that claims a high-risk responsibility or credential
 * (mentoring, training people, leading a team, hiring, a spoken language, a
 * certification, an award, a publication…) with no evidence in the
 * **profile** text. That catches invented duties written in ordinary
 * lower-case words ("I also mentor developers"), which the token check
 * cannot see. The job text is not evidence for a claim: what the posting
 * asks for is exactly what a model is tempted to claim.
 *
 * Known gap, accepted (the shared #522 bar): a capitalized word at a
 * sentence start is not checked, so "Initech hired me." is not caught on
 * its own. Telling a sentence-initial name from an ordinary opener ("At",
 * "During", "Thank") needs a word list or entity recognition, and would also
 * change CV extraction's check.
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

/** True when `text` has a number or name found in neither source. Shared
 *  with the application email (lib/applicationEmail/ai/generate.ts). */
export function ungrounded(text: string, sourceLower: string, mode: ProseGroundingMode): boolean {
  return ungroundedProseTokenCount(text.replace(HONORIFIC_DOT, "$1"), sourceLower, mode) > 0;
}

function normalizeClosing(text: string): string {
  return text.trim().replace(/[,.!]+$/, "").toLowerCase();
}

/** Every language's conventional closing, plus common English ones. */
const CONVENTIONAL_SIGN_OFFS = new Set(
  [
    ...Object.values(COVER_LETTER_CONVENTIONS).map((c) => c.signOff),
    "Kind regards",
    "Best regards",
    "Regards",
    "Yours sincerely",
    "Yours faithfully",
    "With kind regards",
  ].map(normalizeClosing),
);

export interface CoverLetterGroundingResult {
  /** null when nothing grounded is left to review — treat as degraded. */
  suggestion: CoverLetterSuggestion | null;
  droppedParagraphs: number;
  /** Sentences removed by the claim check (claims.ts). */
  removedClaimSentences: number;
  /** Paragraphs dropped by the name/number check only — never overlaps
   *  removedClaimSentences, so the two can be added up for the candidate. */
  tokenDroppedParagraphs: number;
  greetingReplaced: boolean;
  signOffReplaced: boolean;
}

export function groundCoverLetterSuggestion(
  suggestion: CoverLetterSuggestion,
  profileText: string,
  jobText: string,
  outputLanguage: OutputLanguage | null,
  /** #929: the candidate's motivation. Its names and numbers may appear
   *  (it is their own text), but it never backs a claim about experience,
   *  so it is kept out of the claim check. */
  tokenOnlyText: string | null = null,
): CoverLetterGroundingResult {
  const sourceLower = `${profileText}\n${jobText}${tokenOnlyText ? `\n${tokenOnlyText}` : ""}`.toLowerCase();
  const paragraphMode: ProseGroundingMode = outputLanguage === "de" ? "headline" : "prose";
  const conventions = COVER_LETTER_CONVENTIONS[outputLanguage ?? "en"];

  const evidence = claimEvidence(profileText);
  let removedClaimSentences = 0;
  const claimRules = new Set<string>();
  const claimChecked: string[] = [];
  for (const paragraph of suggestion.paragraphs) {
    const stripped = stripUnbackedClaims(paragraph, evidence);
    removedClaimSentences += stripped.removedSentences;
    for (const rule of stripped.rules) claimRules.add(rule);
    if (stripped.paragraph) claimChecked.push(stripped.paragraph);
  }

  const paragraphs = claimChecked.filter((paragraph) => !ungrounded(paragraph, sourceLower, paragraphMode));
  const droppedParagraphs = suggestion.paragraphs.length - paragraphs.length;
  const tokenDroppedParagraphs = claimChecked.length - paragraphs.length;

  const greetingSource = `${sourceLower}\n${SALUTATION_WORDS.join(" ")}`;
  const greetingReplaced = ungrounded(suggestion.greeting, greetingSource, "prose");
  const signOffReplaced =
    !CONVENTIONAL_SIGN_OFFS.has(normalizeClosing(suggestion.signOff)) && ungrounded(suggestion.signOff, greetingSource, "prose");

  if (droppedParagraphs > 0 || removedClaimSentences > 0 || greetingReplaced || signOffReplaced) {
    log.warn("coverLetter.ai.ungrounded", {
      // Counts, flags and rule ids only — the letter text is profile-derived content.
      droppedParagraphs,
      removedClaimSentences,
      claimRules: [...claimRules],
      keptParagraphs: paragraphs.length,
      greetingReplaced,
      signOffReplaced,
    });
  }

  if (paragraphs.length === 0) {
    return { suggestion: null, droppedParagraphs, removedClaimSentences, tokenDroppedParagraphs, greetingReplaced, signOffReplaced };
  }

  // The checks above ignore case; names go out spelled as the source has them.
  const casing = sourceCasing(`${profileText}\n${jobText}`);
  return {
    suggestion: {
      greeting: casing.apply(greetingReplaced ? conventions.neutralGreeting : suggestion.greeting),
      paragraphs: paragraphs.map((paragraph) => casing.apply(paragraph)),
      signOff: signOffReplaced ? conventions.signOff : suggestion.signOff,
    },
    droppedParagraphs,
    removedClaimSentences,
    tokenDroppedParagraphs,
    greetingReplaced,
    signOffReplaced,
  };
}
