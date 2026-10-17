/**
 * Fetch-quality signal for a job-posting fetch that technically succeeded
 * (issue #520).
 *
 * `fetchJobPosting` only refuses a page whose readable text is under
 * `MIN_USEFUL_CHARACTERS`. A cookie wall, an "enable JavaScript" notice or a
 * loading shell easily clears that bar while saying nothing about the role,
 * and would then be fed to a tailoring call with nothing real to work from.
 * This module flags those fetches so the candidate can be warned *before*
 * an AI call is spent. It is a warning, never a block: a flagged fetch is
 * still stored and still usable.
 *
 * Cheap heuristics only (no model, no DOM parser). Pure and free of
 * `server-only`, so it can be unit-tested and reused by any intake path.
 * The result carries stable reason codes, never page text.
 */

/** Why a fetch looks incomplete. Stable codes: they are persisted on
 *  `TargetJob.fetchQualityReasons` and returned by the fetch-job API. */
export type FetchQualityReason =
  /** Readable text is under the "looks like a real posting" floor. */
  | "TEXT_TOO_SHORT"
  /** Neither a title nor an employer could be identified. */
  | "NO_TITLE_OR_EMPLOYER"
  /** Most of the text is cookie / JavaScript / newsletter / sign-in boilerplate. */
  | "MOSTLY_BOILERPLATE";

export interface FetchQuality {
  looksIncomplete: boolean;
  reasons: FetchQualityReason[];
}

export interface FetchQualityInput {
  rawText: string;
  title: string | null;
  employer: string | null;
  /** The text came from a schema.org JobPosting `description` (#516). */
  fromStructuredData?: boolean;
}

/**
 * Below this many characters, page text is unlikely to be a full posting.
 * Well above `MIN_USEFUL_CHARACTERS` (120), which only rules out empty shells.
 */
export const REAL_POSTING_MIN_CHARACTERS = 500;

/**
 * A JobPosting `description` is the employer's own posting text with no
 * page chrome around it, so a shorter one is still credible.
 */
export const STRUCTURED_POSTING_MIN_CHARACTERS = 200;

/** Share of the text (by characters) that may be boilerplate before the
 *  fetch is flagged. */
export const MAX_BOILERPLATE_SHARE = 0.4;

/**
 * Only short lines count as boilerplate: banners and notices are one-liners,
 * while a long paragraph that happens to mention "cookies" or "sign in" is
 * posting text.
 */
const MAX_BOILERPLATE_LINE_CHARACTERS = 300;

/**
 * Lines that are page chrome rather than posting content. English plus the
 * most common Dutch / French / German phrasings, since ResuMatch candidates
 * paste Benelux career pages.
 */
const BOILERPLATE_PATTERNS: readonly RegExp[] = [
  // Cookie / consent banners.
  /\bcookies?\b/i,
  /\b(accept|reject|allow|deny)( all)?\b.*\b(cookies?|tracking|consent)\b/i,
  /\b(manage|cookie) (preferences|settings)\b/i,
  /\bconsent\b/i,
  /\b(akkoord|accepteren|accepter|akzeptieren|tout accepter|alle akzeptieren)\b/i,
  // JavaScript / browser notices and loading shells.
  /\b(enable|turn on|activate)\b.*\bjavascript\b/i,
  /\bjavascript\b.*\b(required|disabled|is off|not enabled)\b/i,
  /\b(unsupported|outdated|update your) browser\b/i,
  /^\s*(loading|please wait|chargement|laden|wird geladen)\W*$/i,
  // Newsletters and sign-in walls.
  /\b(subscribe|sign up)\b.*\b(newsletter|updates|alerts)\b/i,
  /\bnewsletter\b/i,
  /\b(sign|log) ?in\b.*\b(to (continue|view|apply|see))\b/i,
  /\b(create an account|forgot (your )?password)\b/i,
  // Footer chrome.
  /\b(privacy (policy|statement|notice)|terms (of (use|service)|and conditions))\b/i,
  /\ball rights reserved\b|©/i,
];

function isBoilerplateLine(line: string): boolean {
  if (line.length > MAX_BOILERPLATE_LINE_CHARACTERS) return false;
  return BOILERPLATE_PATTERNS.some((pattern) => pattern.test(line));
}

/** Share (0–1) of non-blank characters that sit on boilerplate lines. */
export function boilerplateShare(rawText: string): number {
  let total = 0;
  let boilerplate = 0;
  for (const raw of rawText.split("\n")) {
    const line = raw.trim();
    if (line.length === 0) continue;
    total += line.length;
    if (isBoilerplateLine(line)) boilerplate += line.length;
  }
  return total === 0 ? 0 : boilerplate / total;
}

export function assessFetchQuality(input: FetchQualityInput): FetchQuality {
  const reasons: FetchQualityReason[] = [];
  const text = input.rawText.trim();

  const floor = input.fromStructuredData
    ? STRUCTURED_POSTING_MIN_CHARACTERS
    : REAL_POSTING_MIN_CHARACTERS;
  if (text.length < floor) reasons.push("TEXT_TOO_SHORT");

  if (!input.title?.trim() && !input.employer?.trim())
    reasons.push("NO_TITLE_OR_EMPLOYER");

  if (boilerplateShare(text) >= MAX_BOILERPLATE_SHARE)
    reasons.push("MOSTLY_BOILERPLATE");

  return { looksIncomplete: reasons.length > 0, reasons };
}
