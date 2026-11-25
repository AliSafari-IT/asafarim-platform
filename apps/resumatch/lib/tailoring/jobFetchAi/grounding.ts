import type { PageEvidence } from "../fetchJob";

/**
 * Grounding for the AI-browsing tier of job fetch (issue #521).
 *
 * The browsing prompt tells the model to extract only what the page states,
 * but that is an instruction, not a check. This module is the check: the
 * deterministic GET already pulled the page's real HTML (it only failed
 * because the readable body text was too short), so the page's own title,
 * meta tags and JSON-LD are known. The model's claimed `title` and
 * `employer` are compared against that text. The same two-locks pattern as
 * `lib/extraction/ai/grounding.ts`, shaped for a URL instead of a CV.
 *
 * **Decision: lenient flag, not strict reject.** A mismatch keeps the AI
 * result and adds the `NOT_ON_FETCHED_PAGE` quality warning, so the
 * candidate is told to check the title and employer before tailoring.
 * Rejecting was considered and not chosen:
 * - the pages that reach this tier are mostly JavaScript shells whose
 *   server HTML carries little more than a generic `<title>` (a job board's
 *   name), so a "not found on the page" result is often a false alarm;
 * - the call is already paid for, and the candidate can see and correct a
 *   title or employer on the job before any CV is written;
 * - the tailoring step never trusts the job text for facts about the
 *   candidate, so a wrong job title cannot put an invented claim on a CV.
 * The model's values are never silently replaced with the page's either: a
 * shell's `<title>` is usually worse than what the model read.
 *
 * A field is checked only when the page gave enough to check it against
 * (see `MIN_EVIDENCE_TOKENS`). With no evidence at all (the GET was blocked
 * or failed on the network) the result is `unverifiable` and carries no
 * warning, the same as before this check existed.
 */

export type GroundingStatus = "grounded" | "mismatch" | "unverifiable";
export type GroundedField = "title" | "employer";

export interface JobFetchGrounding {
  status: GroundingStatus;
  /** The fields whose words are mostly absent from the fetched page. */
  mismatched: GroundedField[];
}

/** Below this many distinct words, the page text cannot confirm anything. */
export const MIN_EVIDENCE_TOKENS = 6;

/** Share of a field's words that must appear on the page. */
export const MIN_SUPPORTED_SHARE = 0.5;

/**
 * Words that carry no identity: articles and the gender markers job titles
 * carry in the Benelux ("m/v/x", "h/f"). English, Dutch, French, German.
 */
const STOPWORDS = new Set([
  "a", "an", "the", "of", "and", "at", "for", "in", "on", "to", "with",
  "de", "het", "een", "van", "en", "voor", "bij", "te",
  "la", "le", "les", "des", "du", "et", "un", "une", "au", "aux",
  "der", "die", "das", "und", "fur", "im", "bei", "zu",
  "m", "v", "x", "f", "h", "w", "d", "mvx", "hf", "mwd",
]);

export function groundingTokens(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

/** Share (0–1) of a value's words found in the page's words. */
export function supportedShare(value: string, pageTokens: ReadonlySet<string>): number {
  const tokens = [...new Set(groundingTokens(value))];
  if (tokens.length === 0) return 1;
  return tokens.filter((t) => pageTokens.has(t)).length / tokens.length;
}

export function groundJobFetchOutput(
  output: { title: string | null; employer: string | null },
  evidence: PageEvidence | null | undefined,
): JobFetchGrounding {
  if (!evidence) return { status: "unverifiable", mismatched: [] };
  const pageTokens = new Set(groundingTokens(evidence.pageText));
  if (pageTokens.size < MIN_EVIDENCE_TOKENS) return { status: "unverifiable", mismatched: [] };

  const mismatched: GroundedField[] = [];
  for (const field of ["title", "employer"] as const) {
    const value = output[field];
    if (value && supportedShare(value, pageTokens) < MIN_SUPPORTED_SHARE) mismatched.push(field);
  }
  return { status: mismatched.length > 0 ? "mismatch" : "grounded", mismatched };
}
