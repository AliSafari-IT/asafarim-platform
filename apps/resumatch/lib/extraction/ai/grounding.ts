import { log } from "../../observability/logger";
import type { CandidateProfileContent } from "../../profile/contract";

/**
 * A lightweight post-check on AI-written experience highlights (issue
 * #420). The prompt (prompts.ts) already instructs the model to ground
 * every "summary" only in that role's own bullet points — this is the
 * second, structural half of that guarantee, the same two-locks pattern
 * `schema.ts`'s doc comment describes for protected attributes: a prompt
 * rule is advisory, a check over the actual output is not.
 *
 * **What it checks, and why not more.** There is no separate "raw bullets"
 * field to compare a summary against — the model returns one prose
 * `summary` per role, not a quoted source. Word-for-word overlap would
 * also be the wrong bar: legitimate rewording changes verbs and
 * connectors constantly ("built" -> "developed"), so a strict overlap
 * ratio would reject well-grounded, honestly reworded summaries as often
 * as it catches fabricated ones.
 *
 * Instead this targets exactly the tokens where fabrication actually
 * matters: capitalized words (technology names, product names, employer
 * names) and numbers/percentages (metrics). Every such "notable token" in
 * a summary must appear, case-insensitively, somewhere in the CV's own
 * source text — the same text the model was given. A summary with even
 * one ungrounded notable token is dropped entirely (set to `null`, never
 * partially edited) rather than trusted, matching the "never guessed"
 * conservatism this codebase already applies to fields like a
 * certification's `expiresOn`.
 */

const NOTABLE_TOKEN = /[A-Z][A-Za-z0-9+.#]*|\d+(?:\.\d+)?%?/g;

function notableTokens(text: string): string[] {
  return text.match(NOTABLE_TOKEN) ?? [];
}

/**
 * Drop any experience `summary` that mentions a capitalized word or a
 * number not traceable back to the source CV text. Every other field is
 * returned unchanged — this only ever removes a highlight, never rewrites
 * or adds one.
 */
export function groundExperienceSummaries(
  content: CandidateProfileContent,
  sourceText: string,
): CandidateProfileContent {
  if (!content.experience.some((entry) => entry.summary)) return content;

  const sourceLower = sourceText.toLowerCase();

  const experience = content.experience.map((entry) => {
    if (!entry.summary) return entry;

    const ungrounded = notableTokens(entry.summary).filter((token) => !sourceLower.includes(token.toLowerCase()));

    if (ungrounded.length > 0) {
      log.warn("extraction.ai.highlight_ungrounded", {
        // The tokens themselves are CV-derived content and never logged —
        // only the count, same discipline as the extractor's own
        // "length only" logging elsewhere.
        count: ungrounded.length,
      });
      return { ...entry, summary: null };
    }

    return entry;
  });

  return { ...content, experience };
}
