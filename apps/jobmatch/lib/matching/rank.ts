import { locationMatchesAny, normalizeContractType, type ContractType } from "../eligibility/vocabulary";

/**
 * Shortlist ranking after M4's hard filters (JM-042).
 *
 * `rank()` runs strictly *after* `evaluateEligibility()` (lib/eligibility/
 * evaluate.ts) has already thrown out every hard-excluded posting -- it is
 * never a substitute for that filter and never re-applies it. The function
 * signature enforces this structurally rather than by convention: it only
 * ever accepts `eligiblePostings`, the caller's already-filtered list, and
 * has no notion of eligibility at all. A posting this module has never seen
 * cannot appear in its output, which is what the composition test in
 * rank.test.ts exists to prove end-to-end (evaluateEligibility -> filter ->
 * rank).
 *
 * **The returned score is a relevance ordering, never a hiring-probability
 * estimate.** Every field name below says "similarity" or "match", never
 * "probability" or "likelihood" -- on purpose, mirroring how
 * `matching/contract.ts`'s `suitabilityScore` is documented as "not a
 * hiring-probability estimate". `rank()` orders a shortlist for JM-043's
 * later LLM evaluation to run on; it does not predict an outcome, and no
 * type, field, or comment in this module should ever be read as if it did.
 *
 * **No protected attributes reach ranking.** `ExplicitPreferences` is built
 * only from `CandidateProfileContent.preferences` and `skills` (lib/profile/
 * contract.ts), a schema that has no field for a protected attribute at all
 * (`assertNoProtectedAttributes`) -- there is nothing to filter out here
 * because there is nowhere for it to have come from.
 *
 * Pure function: no database access, no embedding-provider call, no I/O.
 * The caller is responsible for having already computed
 * `profileEmbedding`/`postingEmbeddings` (lib/matching/ai/embeddings.ts,
 * lib/matching/ai/embeddingCache.ts) and for having already run
 * `evaluateEligibility()` over every posting to produce `eligiblePostings`.
 */

/** Bounded shortlist size, so JM-043's LLM evaluation only ever runs on a
 *  small top-N. A plain tunable constant, following the convention already
 *  used for other bounded defaults in this app (e.g. lib/search/query.ts's
 *  DEFAULT_PAGE_SIZE). */
export const DEFAULT_SHORTLIST_SIZE = 20;

/** The subset of a JobPosting ranking needs, kept independent of Prisma's
 *  generated type so this module has no database dependency -- mirrors
 *  eligibility/evaluate.ts's `PostingForEligibility`. */
export interface PostingForRanking {
  id: string;
  /** Skills as the posting words them (JobPosting.skillsRaw). Compared to
   *  the candidate's stated skills as free text, folded for comparison. */
  skillsRaw: string[];
  locationRaw: string | null;
  isRemote: boolean | null;
  contractType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
}

/**
 * The explicit candidate preferences ranking scores against -- the same
 * fields `evaluateEligibility` already reads off `CandidateProfileContent`
 * (lib/profile/contract.ts), not a parallel shape. Build this directly from
 * `profile.preferences` and `profile.skills`; do not invent new candidate
 * input here.
 */
export interface ExplicitPreferences {
  /** Candidate skill names (`profile.skills[].name`), free text as written. */
  skills: string[];
  locations: string[];
  remote: "onsite" | "hybrid" | "remote" | "any" | null;
  contractTypes: ContractType[];
  /** Annual gross, in `salaryCurrency`. A floor, never a target -- same
   *  meaning as `preferences.salaryFloor` in the profile contract. */
  salaryFloor: number | null;
  salaryCurrency: string | null;
}

/**
 * Per-factor contribution to a posting's `totalScore`, each independently
 * inspectable (acceptance criteria) so a later UI can show "why" a posting
 * ranked where it did. Every value is 0-1; `totalScore` is their weighted
 * sum, not a probability.
 */
export interface RankScoreBreakdown {
  /** Cosine similarity between profileEmbedding and this posting's
   *  embedding, rescaled from [-1, 1] to [0, 1]. */
  similarity: number;
  /** Overlap between the candidate's stated skills and the posting's
   *  `skillsRaw`, as a fraction of the candidate's skill count. Neutral
   *  (0) when either side is empty -- there is nothing to compare. */
  skillsMatch: number;
  /** 1 when the posting's location satisfies one of the candidate's
   *  preferred locations (or either side states none), 0 otherwise. */
  locationMatch: number;
  /** Remote-preference alignment. "any" is neutral: it neither penalises
   *  nor bonuses, per the profile contract's own remote semantics. */
  remoteMatch: number;
  /** Contract-type alignment via the same normaliser eligibility uses. */
  contractMatch: number;
  /** Graded bonus for how far the posting's salary clears the candidate's
   *  floor. The floor itself is already a hard M4 filter
   *  (BELOW_SALARY_FLOOR) -- this is *additional* ranking signal on top of
   *  postings that already passed it, not a re-application of the filter. */
  salaryMatch: number;
}

/**
 * One ranked shortlist entry. `totalScore` is a relevance ordering only --
 * see the module doc comment -- never surfaced as, or read as, a
 * probability of an offer.
 */
export interface RankedShortlistItem {
  postingId: string;
  totalScore: number;
  breakdown: RankScoreBreakdown;
}

export interface RankOptions {
  /** Maximum shortlist length after sorting. Defaults to
   *  DEFAULT_SHORTLIST_SIZE. */
  limit?: number;
}

/**
 * Weighting of each factor into `totalScore`. Not specified by the issue;
 * this is a starting judgment call, tunable later without touching the
 * function's shape:
 *  - `similarity` carries the most weight (0.5) because it is the only
 *    signal that reflects the posting's actual free-text content rather
 *    than a handful of structured fields.
 *  - `skillsMatch` (0.2) is the next heaviest structured signal -- the
 *    closest explicit proxy for "can this candidate actually do the job".
 *  - `locationMatch` and `remoteMatch` (0.1 each) matter for whether a
 *    candidate can take the role at all, but are already largely enforced
 *    by M4's hard filters, so they contribute less marginal ranking signal
 *    here than skills or similarity do.
 *  - `contractMatch` and `salaryMatch` (0.05 each) are the lightest
 *    factors: salary in particular is already gated by the M4 hard floor,
 *    so this is only the graded "how far above the floor" bonus.
 * The weights sum to 1.0 so `totalScore` stays in [0, 1] when every
 * component is in [0, 1].
 */
const WEIGHTS = {
  similarity: 0.5,
  skillsMatch: 0.2,
  locationMatch: 0.1,
  remoteMatch: 0.1,
  contractMatch: 0.05,
  salaryMatch: 0.05,
} as const;

function foldSkill(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Rescale cosine similarity from [-1, 1] to a [0, 1] score. */
function similarityScore(a: number[], b: number[]): number {
  const cosine = cosineSimilarity(a, b);
  return (cosine + 1) / 2;
}

function skillsMatchScore(candidateSkills: string[], postingSkills: string[]): number {
  if (candidateSkills.length === 0 || postingSkills.length === 0) return 0;
  const posted = new Set(postingSkills.map(foldSkill));
  const overlap = candidateSkills.filter((skill) => posted.has(foldSkill(skill))).length;
  return overlap / candidateSkills.length;
}

function locationMatchScore(preferredLocations: string[], posting: PostingForRanking): number {
  // No preference stated, or the role is remote: nothing to compare
  // against, so this axis is neutral-positive rather than a mismatch --
  // mirrors eligibility's own "absence never excludes" rule.
  if (preferredLocations.length === 0 || posting.isRemote === true) return 1;
  if (!posting.locationRaw) return 1;
  return locationMatchesAny(preferredLocations, posting.locationRaw) ? 1 : 0;
}

function remoteMatchScore(
  remotePreference: ExplicitPreferences["remote"],
  posting: PostingForRanking,
): number {
  // "any" and an unstated preference are both neutral: they neither
  // penalise nor bonus, per the profile contract's own remote semantics.
  if (remotePreference === null || remotePreference === "any") return 1;
  if (posting.isRemote === null) return 1; // posting silent -- absence never penalises
  if (remotePreference === "remote") return posting.isRemote ? 1 : 0;
  // "onsite" or "hybrid": a fully remote-only posting is not a match, but
  // JobMatch does not distinguish onsite/hybrid in `isRemote`, so any
  // non-remote posting is treated as satisfying either preference.
  return posting.isRemote ? 0 : 1;
}

function contractMatchScore(
  contractTypes: ContractType[],
  posting: PostingForRanking,
): number {
  if (contractTypes.length === 0 || !posting.contractType) return 1;
  const normalized = normalizeContractType(posting.contractType);
  if (!normalized) return 1; // unrecognised -- treated as unstated, not a mismatch
  return contractTypes.includes(normalized) ? 1 : 0;
}

function salaryMatchScore(preferences: ExplicitPreferences, posting: PostingForRanking): number {
  // The hard floor itself is already enforced upstream by M4's
  // BELOW_SALARY_FLOOR exclusion, so every posting reaching this function
  // has already cleared it (when comparable at all). This is a *graded*
  // bonus on top of that: how far above the floor the posting's range
  // sits, capped at double the floor so one outlier posting cannot
  // dominate the whole axis.
  if (
    preferences.salaryFloor === null ||
    preferences.salaryFloor === 0 ||
    posting.salaryMax === null ||
    posting.salaryPeriod !== "year" ||
    preferences.salaryCurrency === null ||
    posting.salaryCurrency === null ||
    preferences.salaryCurrency !== posting.salaryCurrency
  ) {
    return 0.5; // not comparable -- neutral, neither rewarded nor penalised
  }
  const ratio = posting.salaryMax / preferences.salaryFloor;
  return Math.max(0, Math.min(1, (ratio - 1) / 1));
}

/**
 * Rank an already-eligible posting set by relevance to a candidate profile.
 *
 * Pure: no I/O, no randomness. Deterministic tie-break on `postingId`
 * (ascending) keeps ordering stable when two postings score identically.
 */
export function rank(
  eligiblePostings: PostingForRanking[],
  profileEmbedding: number[],
  postingEmbeddings: Map<string, number[]>,
  preferences: ExplicitPreferences,
  opts: RankOptions = {},
): RankedShortlistItem[] {
  const limit = opts.limit ?? DEFAULT_SHORTLIST_SIZE;

  const scored: RankedShortlistItem[] = eligiblePostings.map((posting) => {
    const postingEmbedding = postingEmbeddings.get(posting.id);
    const breakdown: RankScoreBreakdown = {
      similarity: postingEmbedding ? similarityScore(profileEmbedding, postingEmbedding) : 0,
      skillsMatch: skillsMatchScore(preferences.skills, posting.skillsRaw),
      locationMatch: locationMatchScore(preferences.locations, posting),
      remoteMatch: remoteMatchScore(preferences.remote, posting),
      contractMatch: contractMatchScore(preferences.contractTypes, posting),
      salaryMatch: salaryMatchScore(preferences, posting),
    };
    const totalScore =
      breakdown.similarity * WEIGHTS.similarity +
      breakdown.skillsMatch * WEIGHTS.skillsMatch +
      breakdown.locationMatch * WEIGHTS.locationMatch +
      breakdown.remoteMatch * WEIGHTS.remoteMatch +
      breakdown.contractMatch * WEIGHTS.contractMatch +
      breakdown.salaryMatch * WEIGHTS.salaryMatch;

    return { postingId: posting.id, totalScore, breakdown };
  });

  scored.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return a.postingId < b.postingId ? -1 : a.postingId > b.postingId ? 1 : 0;
  });

  return scored.slice(0, Math.max(0, limit));
}
