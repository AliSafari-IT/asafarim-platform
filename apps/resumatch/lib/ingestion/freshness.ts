/**
 * Freshness and expiry (JM-029).
 *
 * A stale listing is the most common way a job board wastes a candidate's
 * time: they read it, they apply, and the role was filled two months ago.
 * JobMatch's whole claim is fewer, better opportunities, so a posting it
 * cannot vouch for must be labelled or hidden rather than shown as current.
 *
 * Four dates are tracked separately and never conflated:
 *
 * - `publishedAt`   — when the source says it went live
 * - `expiresAt`     — when the source says it closes
 * - `firstSeenAt`   — when JobMatch first ingested it
 * - `lastSeenAt`    — when a sync last confirmed it still present
 *
 * The last of those is the one that catches silent removals: a source that
 * drops a posting without ever marking it expired is invisible to any check
 * based on the source's own dates.
 */

export type FreshnessState =
  | "CURRENT"
  /** Still listed, but old enough that a candidate should know. */
  | "AGEING"
  /** Past the source's own expiry date. */
  | "EXPIRED"
  /** Gone from the feed without being marked expired. */
  | "DISAPPEARED"
  /** The source's authorisation ended; nothing from it may be shown. */
  | "WITHDRAWN";

export interface FreshnessInput {
  publishedAt: Date | null;
  expiresAt: Date | null;
  lastSeenAt: Date;
  sourceTerminated: boolean;
}

/**
 * A posting not seen in this many days is treated as gone.
 *
 * Chosen to be comfortably longer than any plausible sync gap: it must not
 * fire because ingestion was down over a weekend. Sources that sync daily
 * will trip it three days after a posting truly disappears.
 */
export const DISAPPEARED_AFTER_DAYS = 3;

/**
 * A posting older than this is labelled, not hidden. It may still be open —
 * plenty of vacancies run for months — so the honest thing is to show the
 * age and let the candidate judge, rather than silently dropping it.
 */
export const AGEING_AFTER_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export function assessFreshness(input: FreshnessInput, now: Date = new Date()): FreshnessState {
  // Authorisation outranks every date. If the agreement ended, the posting
  // is not JobMatch's to display whatever its own dates say.
  if (input.sourceTerminated) return "WITHDRAWN";

  if (input.expiresAt && input.expiresAt.getTime() <= now.getTime()) return "EXPIRED";

  const daysSinceSeen = (now.getTime() - input.lastSeenAt.getTime()) / DAY_MS;
  if (daysSinceSeen >= DISAPPEARED_AFTER_DAYS) return "DISAPPEARED";

  if (input.publishedAt) {
    const age = (now.getTime() - input.publishedAt.getTime()) / DAY_MS;
    if (age >= AGEING_AFTER_DAYS) return "AGEING";
  }

  return "CURRENT";
}

/** Whether a state may be shown to a candidate as an open vacancy. */
export function isDisplayable(state: FreshnessState): boolean {
  return state === "CURRENT" || state === "AGEING";
}

/**
 * What to tell the candidate about a posting's age. Only `AGEING` earns a
 * label: a current posting needs no caveat, and the rest are not shown.
 */
export function freshnessLabel(state: FreshnessState, publishedAt: Date | null, now: Date = new Date()): string | null {
  if (state !== "AGEING" || !publishedAt) return null;
  const days = Math.floor((now.getTime() - publishedAt.getTime()) / DAY_MS);
  if (days >= 90) return "Posted over 3 months ago — may no longer be open";
  if (days >= 60) return "Posted over 2 months ago";
  return "Posted over a month ago";
}

/** The posting status a freshness state implies. */
export function statusForFreshness(state: FreshnessState): "ACTIVE" | "EXPIRED" | "WITHDRAWN" {
  switch (state) {
    case "CURRENT":
    case "AGEING":
      return "ACTIVE";
    case "EXPIRED":
    case "DISAPPEARED":
      return "EXPIRED";
    case "WITHDRAWN":
      return "WITHDRAWN";
  }
}
