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

/** Start of the string, or right after a sentence terminator / newline / spaced dash. */
const SENTENCE_START = /(?:^|[.!?\n]\s*|\s[-–—]\s)$/;

/**
 * A token whose SHAPE says "technology or product name" independent of
 * capitalization: contains a digit, a `+`/`#`, an interior dot ("Node.js",
 * "ASP.NET"), an interior capital ("PostgreSQL", "TypeScript", "iOS"), or
 * is an ALL-CAPS acronym ("AWS", "SQL"). An ordinary Title Case word
 * ("Engineer") has none of these.
 */
const DISTINCTIVE_SHAPE = /\d|[+#]|.\.[A-Za-z]|[a-z][A-Z]|^[A-Z]{2,}$/;

/**
 * Count the notable tokens in top-level prose that are not traceable to
 * the source text. `mode` picks which tokens count as a fabrication signal
 * — the judgement call in issue #522, which asked for the identical bar
 * `groundExperienceSummaries` uses and could not have it as-is:
 *
 * - **`"prose"` (`summary`)**: every number/percentage, and every
 *   capitalized word that is NOT at the start of a sentence. Sentence
 *   openers ("Experienced…", "Results-driven…") are generic words that
 *   rarely appear in a CV verbatim; counting them would drop nearly every
 *   honest AI-written summary. A capital mid-sentence is a real
 *   proper-noun signal (technology, product, employer).
 * - **`"headline"` (`headline`)**: every number, and every token with a
 *   distinctive technology *shape* (see `DISTINCTIVE_SHAPE`). A headline is
 *   Title Case — "Senior Backend Engineer · React" capitalizes every
 *   word — so capitalization tells us nothing there, and treating a `·` or
 *   `|` as a fragment start (which an earlier draft did) exempted the
 *   entries after it, i.e. exactly where a fabricated skill would sit.
 *   Known gap, accepted: a fabricated tech name with no distinctive shape
 *   ("Terraform") is indistinguishable from an ordinary Title Case word
 *   and is not caught in a headline; the same claim in `summary` is.
 *
 * Trailing dots are stripped so "React." at a sentence end is checked as
 * "React" — otherwise a grounded word would only match if the source
 * happened to punctuate it identically.
 */
function ungroundedProseTokenCount(text: string, sourceLower: string, mode: "prose" | "headline"): number {
  let count = 0;
  for (const match of text.matchAll(NOTABLE_TOKEN)) {
    const token = match[0].replace(/\.+$/, "");
    if (token.length === 0) continue;
    const isNumber = /^\d/.test(token);
    if (!isNumber) {
      if (mode === "headline") {
        if (!DISTINCTIVE_SHAPE.test(token)) continue;
      } else if (SENTENCE_START.test(text.slice(0, match.index))) {
        continue;
      }
    }
    if (!sourceLower.includes(token.toLowerCase())) count += 1;
  }
  return count;
}

/**
 * Drop the top-level `headline` and/or `summary` when they mention a
 * number or a mid-sentence proper noun not traceable back to the source CV
 * text (issue #522). Same conservatism as `groundExperienceSummaries`: the
 * whole field goes to `null`, never a partial edit, and nothing is ever
 * added or rewritten. Every other field is returned unchanged.
 */
export function groundHeadlineAndSummary(
  content: CandidateProfileContent,
  sourceText: string,
): CandidateProfileContent {
  if (!content.headline && !content.summary) return content;

  const sourceLower = sourceText.toLowerCase();
  const next = { ...content };

  for (const field of ["headline", "summary"] as const) {
    const value = content[field];
    if (!value) continue;
    const ungrounded = ungroundedProseTokenCount(value, sourceLower, field === "headline" ? "headline" : "prose");
    if (ungrounded > 0) {
      log.warn("extraction.ai.prose_ungrounded", {
        // Field name and count only — the text itself is CV-derived content.
        field,
        count: ungrounded,
      });
      next[field] = null;
    }
  }

  return next;
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
