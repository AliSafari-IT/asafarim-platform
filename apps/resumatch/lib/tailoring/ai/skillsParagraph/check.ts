import { ungroundedProseTokenCount } from "../../../extraction/ai/grounding";
import { claimEvidence, splitSentences, unbackedClaims } from "../coverLetter/claims";
import type { OutputLanguage } from "../../language";
import { MAX_SKILLS_PARAGRAPH_LENGTH } from "./prompts";

/**
 * The structural half of the skills paragraph's no-fabrication guarantee.
 * The prompt asks for listed skills only; this checks the reply, sentence
 * by sentence, and removes any sentence that:
 *
 * - names something that isn't on this CV: a number, or a capitalized or
 *   technology-shaped word ("Kubernetes", "AWS", "C#", "Node.js") found in
 *   neither the CV's skill names nor its category labels. Both the
 *   mid-sentence check (`prose`) and the shape check (`headline`, which also
 *   sees a sentence's first word) run, so "Kubernetes and Docker are…" is
 *   caught too. German capitalizes every noun, so a German paragraph runs
 *   the shape check only — the same trade-off the cover letter accepts;
 * - makes a high-risk claim (mentoring, leading people, a certification…)
 *   the profile text doesn't back — the cover letter's claim rules
 *   (coverLetter/claims.ts);
 * - rates the candidate ("expert", "senior", "years of experience") —
 *   never a fact a skill list can back.
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

const RATING =
  /\b(?:expert\w*|senior|seniority|advanced|years?|decades?|jaren|jaar|ervaren|ans|années|expérimenté\w*|jahre\w*|jahrzehnt\w*|erfahren\w*|langjährig\w*)\b/i;

export interface SkillsParagraphCheckResult {
  /** null when nothing is left to show. */
  paragraph: string | null;
  removedSentences: number;
  /** Reasons, for logging only (never the text). */
  reasons: string[];
}

export function checkSkillsParagraph(
  text: string,
  {
    skills,
    categoryLabels,
    profileText,
    language,
  }: { skills: string[]; categoryLabels: string[]; profileText: string; language: OutputLanguage },
): SkillsParagraphCheckResult {
  const cleaned = text
    .replace(/^\s*["“”']+|["“”']+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const sourceLower = [...skills, ...categoryLabels].join("\n").toLowerCase();
  const evidence = claimEvidence(profileText);

  const kept: string[] = [];
  const reasons: string[] = [];
  let removedSentences = 0;
  for (const sentence of splitSentences(cleaned)) {
    const why: string[] = [];
    if (language !== "de" && ungroundedProseTokenCount(sentence, sourceLower, "prose") > 0) why.push("unlisted_name");
    else if (ungroundedProseTokenCount(sentence, sourceLower, "headline") > 0) why.push("unlisted_name");
    if (RATING.test(sentence)) why.push("rating");
    why.push(...unbackedClaims(sentence, evidence));
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
