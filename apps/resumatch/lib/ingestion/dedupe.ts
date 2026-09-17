/**
 * Deduplication and the choice of display representative (JM-028).
 *
 * The same vacancy reaches JobMatch more than once: an employer publishes
 * it, an aggregator republishes it, and a second aggregator republishes
 * that. Showing a candidate the same job three times is the exact failure
 * this product exists to avoid, so duplicates are linked rather than
 * discarded — the copies are kept for provenance and only the
 * representative is ever displayed.
 *
 * Pure functions over plain records, so the matching rules can be exhausted
 * in tests instead of inferred from query behaviour.
 */

export interface DedupeCandidate {
  id: string;
  sourceId: string;
  externalId: string;
  canonicalUrl: string;
  canonicalKey: string;
  publishedAt: Date | null;
  firstSeenAt: Date;
  /** Whether this source's agreement permits commercial reuse. */
  commercialUse: boolean | null;
  /** Whether the source is the employer itself rather than an aggregator. */
  isDirectEmployer: boolean;
}

export type DuplicateReason = "SAME_SOURCE_ID" | "SAME_URL" | "SAME_CANONICAL_KEY";

export interface DuplicateVerdict {
  isDuplicate: boolean;
  reason?: DuplicateReason;
  /** The posting the candidate duplicates. */
  representativeId?: string;
}

/**
 * Decide whether an incoming posting duplicates one already stored.
 *
 * Ordered from strongest evidence to weakest, and it matters: two postings
 * with the same source identifier are the same record being re-fetched,
 * while two with the same canonical key are a *judgement* that they describe
 * the same job. Reporting which rule fired is what makes a wrong merge
 * diagnosable rather than mysterious.
 */
export function findDuplicate(
  incoming: Omit<DedupeCandidate, "id">,
  existing: DedupeCandidate[],
): DuplicateVerdict {
  // Same source, same identifier: this is the same record, not a duplicate
  // job. The caller updates it in place.
  const sameRecord = existing.find(
    (candidate) =>
      candidate.sourceId === incoming.sourceId && candidate.externalId === incoming.externalId,
  );
  if (sameRecord) {
    return { isDuplicate: true, reason: "SAME_SOURCE_ID", representativeId: sameRecord.id };
  }

  // The same apply link is the same vacancy, whoever republished it.
  const sameUrl = existing.find((candidate) => candidate.canonicalUrl === incoming.canonicalUrl);
  if (sameUrl) {
    return { isDuplicate: true, reason: "SAME_URL", representativeId: sameUrl.id };
  }

  // Employer, title and location agreeing is good evidence, not proof — two
  // genuinely distinct openings on one team can look identical. It is the
  // weakest rule and is applied last.
  const sameKey = existing.filter((candidate) => candidate.canonicalKey === incoming.canonicalKey);
  if (sameKey.length > 0) {
    return {
      isDuplicate: true,
      reason: "SAME_CANONICAL_KEY",
      representativeId: chooseRepresentative(sameKey).id,
    };
  }

  return { isDuplicate: false };
}

/**
 * Which copy a candidate should actually see.
 *
 * Preference order, and each step has a reason:
 *
 * 1. **The employer's own posting.** It is the most authoritative, most
 *    likely to be current, and applying there avoids an intermediary.
 * 2. **A source whose agreement permits commercial reuse.** Displaying a
 *    posting from a source that has not granted that is a rights problem,
 *    not a preference.
 * 3. **The earliest publication.** The original rather than a republication.
 * 4. **The earliest first seen**, then id, purely so the result is stable —
 *    a representative that changes between runs makes a saved job look like
 *    it moved.
 */
export function chooseRepresentative(candidates: DedupeCandidate[]): DedupeCandidate {
  if (candidates.length === 0) throw new Error("chooseRepresentative requires at least one candidate");

  return [...candidates].sort((a, b) => {
    if (a.isDirectEmployer !== b.isDirectEmployer) return a.isDirectEmployer ? -1 : 1;

    const aCommercial = a.commercialUse === true;
    const bCommercial = b.commercialUse === true;
    if (aCommercial !== bCommercial) return aCommercial ? -1 : 1;

    const aPublished = a.publishedAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const bPublished = b.publishedAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (aPublished !== bPublished) return aPublished - bPublished;

    const seen = a.firstSeenAt.getTime() - b.firstSeenAt.getTime();
    if (seen !== 0) return seen;

    return a.id.localeCompare(b.id);
  })[0];
}
