import { claimEvidence, splitSentences, unbackedClaims } from "../coverLetter/claims";
import type { OutputLanguage } from "../../language";
import { MAX_SKILLS_PARAGRAPH_LENGTH } from "./prompts";

/**
 * The structural half of the skills paragraph's no-fabrication guarantee.
 * The prompt asks for listed skills only; this checks the reply, sentence
 * by sentence, and removes any sentence that:
 *
 * - names something that isn't on this CV: a number, or a capitalized or
 *   technology-shaped word ("Kubernetes", "AWS", "C#", "Node.js") that is
 *   not a whole word of a listed skill name, or of the heading of a group
 *   the prompt actually contained. Whole words, not substrings: "Java" is
 *   not backed by "JavaScript", nor "AI" by an "AI & Machine Learning"
 *   heading the CV has no skills under. Tech-shaped words are checked
 *   anywhere, a sentence's first word included; plain capitalized words
 *   only mid-sentence. German capitalizes every noun, so a German paragraph
 *   checks numbers and tech-shaped words only (the cover letter's
 *   trade-off). A handful of generic words ("APIs", "UI") name no
 *   technology and are always accepted;
 * - makes a high-risk claim (mentoring, leading people, a certification…)
 *   the profile text doesn't back — the cover letter's claim rules
 *   (coverLetter/claims.ts);
 * - rates the candidate ("expert", "senior", "years of experience") —
 *   never a fact a skill list can back. Listed skill names are taken out of
 *   the sentence first, so a skill called "Expert Systems" is not a rating.
 *
 * Nothing is rewritten or added. A reply with no sentence left fails, and
 * the CV keeps its current skills layout.
 *
 * Known gap, accepted (the shared #522 bar): a plain-shaped name as a
 * sentence's first word ("Terraform pipelines…") is not caught, since it
 * can't be told from an ordinary opener ("Delivery…", "Testing…") without
 * a word list. The prompt forbids it; numbers and tech-shaped names are
 * caught anywhere.
 */

/** Ratings and selling words the prompt forbids, in EN/NL/FR/DE. Checked
 *  outside listed skill names only. */
const RATING = new RegExp(
  "(?<![\\p{L}\\p{N}])(?:" +
    [
      "expert\\p{L}*", "senior", "seniority", "advanced", "years?", "decades?", "excellent", "outstanding",
      "exceptional", "passionate", "world-class", "highly skilled", "proficient", "mastery",
      "jaren", "jaar", "ervaren", "uitstekend\\p{L}*", "gepassioneerd\\p{L}*", "deskundig\\p{L}*",
      "ans", "années", "expérimenté\\p{L}*", "excellente?s?", "passionnée?s?", "chevronnée?s?",
      "jahre\\p{L}*", "jahrzehnt\\p{L}*", "erfahren\\p{L}*", "langjährig\\p{L}*", "hervorragend\\p{L}*", "leidenschaftlich\\p{L}*",
    ].join("|") +
    ")(?![\\p{L}\\p{N}])",
  "iu",
);

export interface SkillsParagraphCheckResult {
  /** null when nothing is left to show. */
  paragraph: string | null;
  removedSentences: number;
  /** Reasons, for logging only (never the text). */
  reasons: string[];
}

/** A word as the check sees it: letters/digits plus the characters tech
 *  names carry inside them ("C#", "C++", "Node.js", "ASP.NET"). */
const WORD = /[\p{L}\p{N}][\p{L}\p{N}+#.]*/gu;
/** Same shape test as lib/extraction/ai/grounding.ts's DISTINCTIVE_SHAPE. */
const DISTINCTIVE_SHAPE = /\d|[+#]|.\.[A-Za-z]|[a-z][A-Z]|^[A-Z]{2,}$/;
const SENTENCE_START = /(?:^|[.!?:;]\s*|\s[-–—]\s)$/;
/** Generic words fluent prose needs that name no technology of their own
 *  ("designs APIs", "a clean UI"): accepted without a listed skill. Kept
 *  tiny on purpose: anything that could be a skill (REST, CI/CD, SQL) is
 *  still only backed by the list. */
const GENERIC_WORDS = new Set(["api", "apis", "ui", "uis", "ux"]);

function words(text: string): { word: string; index: number }[] {
  return [...text.matchAll(WORD)].map((m) => ({ word: m[0].replace(/\.+$/, ""), index: m.index ?? 0 }));
}

/** Every whole word of the evidence, lower-cased, plus the dotted parts of
 *  compound names ("asp.net" also backs "NET" in ".NET"). */
function evidenceWords(sources: string[]): Set<string> {
  const set = new Set<string>();
  for (const source of sources) {
    for (const { word } of words(source)) {
      const lower = word.toLowerCase();
      set.add(lower);
      for (const part of lower.split(".")) if (part) set.add(part);
    }
  }
  return set;
}

function hasUnlistedName(sentence: string, evidence: Set<string>, language: OutputLanguage): boolean {
  for (const { word, index } of words(sentence)) {
    if (!word) continue;
    // Listed skill names were taken out of `sentence` already, so any
    // number still here is outside a skill name: never backed ("Windows 11"
    // doesn't back "11 projects").
    if (/\p{N}/u.test(word)) return true;
    const shaped = DISTINCTIVE_SHAPE.test(word);
    const capitalized = /^\p{Lu}/u.test(word);
    const notable = shaped || (language !== "de" && capitalized && !SENTENCE_START.test(sentence.slice(0, index)));
    if (notable && !evidence.has(word.toLowerCase()) && !GENERIC_WORDS.has(word.toLowerCase())) return true;
  }
  return false;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface SkillsParagraphCheckInput {
  skills: string[];
  /** Headings of the groups the prompt contained — never the whole taxonomy. */
  categoryLabels: string[];
  profileText: string;
  language: OutputLanguage;
}

/** One sentence the check would not keep, and why. */
export interface FlaggedSentence {
  sentence: string;
  reasons: string[];
}

function normalizeParagraph(text: string): string {
  return text
    .replace(/^\s*["“”']+|["“”']+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Runs the sentence rules over `text`: each sentence with the reasons it
 *  fails (none when it passes). Shared by the AI check below and the
 *  advisory review of a paragraph the candidate edited by hand. */
function judgeSentences(
  text: string,
  { skills, categoryLabels, profileText, language }: SkillsParagraphCheckInput,
): FlaggedSentence[] {
  const evidence = evidenceWords([...skills, ...categoryLabels]);
  const claims = claimEvidence(profileText);
  // Longest first, so "Expert Systems design" is taken out before "Expert Systems".
  const skillSpans = [...skills]
    .sort((a, b) => b.length - a.length)
    .map((name) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "giu"));

  return splitSentences(text).map((sentence) => {
    const why: string[] = [];
    // Listed names are checked as whole spans: what's left is what the
    // model added around them.
    const withoutSkills = skillSpans.reduce((rest, span) => rest.replace(span, "skill"), sentence);
    if (hasUnlistedName(withoutSkills, evidence, language)) why.push("unlisted_name");
    if (RATING.test(withoutSkills)) why.push("rating");
    why.push(...unbackedClaims(sentence, claims));
    return { sentence, reasons: [...new Set(why)] };
  });
}

export function checkSkillsParagraph(text: string, input: SkillsParagraphCheckInput): SkillsParagraphCheckResult {
  const kept: string[] = [];
  const reasons: string[] = [];
  let removedSentences = 0;
  for (const { sentence, reasons: why } of judgeSentences(normalizeParagraph(text), input)) {
    if (why.length > 0) {
      removedSentences += 1;
      reasons.push(...why);
    } else {
      kept.push(sentence);
    }
  }

  let paragraph = kept.join(" ").trim();
  if (paragraph.length > MAX_SKILLS_PARAGRAPH_LENGTH) {
    // Whole sentences only, never a cut mid-word.
    const fitted: string[] = [];
    for (const sentence of kept) {
      if ([...fitted, sentence].join(" ").length > MAX_SKILLS_PARAGRAPH_LENGTH) break;
      fitted.push(sentence);
    }
    removedSentences += kept.length - fitted.length;
    paragraph = fitted.join(" ");
  }
  return { paragraph: paragraph || null, removedSentences, reasons: [...new Set(reasons)] };
}

/**
 * The same rules as advice, for a paragraph the candidate edited by hand:
 * their words are their own claims (as with hand-written review bullets,
 * #927), so nothing is removed. The sentences the AI check would not have
 * kept are returned so the preview can point at them: a tool the CV does
 * not list (often one taken off the skill list after the edit), a rating,
 * or a claim the profile does not back.
 */
export function reviewSkillsParagraph(text: string, input: SkillsParagraphCheckInput): FlaggedSentence[] {
  return judgeSentences(normalizeParagraph(text), input).filter((item) => item.reasons.length > 0);
}
