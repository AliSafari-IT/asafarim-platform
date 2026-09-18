/**
 * Controlled vocabularies for search and eligibility (JM-036).
 *
 * The rule every function here follows: normalise for comparison, never for
 * display. A posting's `locationRaw` and `contractType` are shown to the
 * candidate exactly as the source wrote them; these functions only decide
 * whether two differently-worded values mean the same thing, and the
 * original text is never overwritten by what they conclude.
 *
 * Every normaliser returns `null` for a value it cannot confidently place,
 * and a `null` is treated as "unknown" everywhere it is used — never as a
 * mismatch. Guessing wrong here would exclude someone from a job they were
 * actually eligible for, which is worse than not filtering at all.
 */

/** Lowercase, strip diacritics, collapse whitespace and punctuation. */
export function foldText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * City and region synonyms across Belgium's languages. A candidate who sets
 * "Brussels" as a preference must match a posting that says "Bruxelles" or
 * "Brussel" — they are the same place, and failing to recognise that would
 * hide every Dutch- or French-labelled posting in the city a candidate
 * actually wants.
 */
const LOCATION_SYNONYMS: Record<string, string> = {
  bruxelles: "brussels",
  brussel: "brussels",
  antwerpen: "antwerp",
  anvers: "antwerp",
  gent: "ghent",
  gand: "ghent",
  luik: "liege",
  liege: "liege",
  mechelen: "mechelen",
  malines: "mechelen",
  leuven: "leuven",
  louvain: "leuven",
  bergen: "mons",
  doornik: "tournai",
  brugge: "bruges",
};

/** Canonical form of a location string, for comparison only. */
export function foldLocation(value: string): string {
  const folded = foldText(value);
  // A synonym is replaced token by token, not matched against the whole
  // string: a posting location is routinely "Bruxelles, Belgique" rather
  // than the bare city name, and only the whole-string form would ever
  // find "bruxelles" in it otherwise.
  return folded
    .split(" ")
    .map((token) => LOCATION_SYNONYMS[token] ?? token)
    .join(" ");
}

/**
 * Whether a posting's location satisfies any of the candidate's preferred
 * locations. Substring matching in both directions, because a preference of
 * "Hasselt" should match a posting location of "Hasselt, Belgium" and a
 * preference of "Hasselt, Belgium" should match a posting that just says
 * "Hasselt".
 */
export function locationMatchesAny(preferred: string[], postingLocation: string): boolean {
  const folded = foldLocation(postingLocation);
  return preferred.some((pref) => {
    const foldedPref = foldLocation(pref);
    return folded.includes(foldedPref) || foldedPref.includes(folded);
  });
}

/** The contract-type vocabulary the candidate profile contract already uses. */
export type ContractType = "permanent" | "fixed_term" | "contract" | "internship" | "temporary";

const CONTRACT_TYPE_ALIASES: Record<string, ContractType> = {
  permanent: "permanent",
  "permanent contract": "permanent",
  cdi: "permanent",
  "vast contract": "permanent",
  "onbepaalde duur": "permanent",
  "fixed term": "fixed_term",
  "fixed-term": "fixed_term",
  cdd: "fixed_term",
  "bepaalde duur": "fixed_term",
  contract: "contract",
  contractor: "contract",
  freelance: "contract",
  zelfstandige: "contract",
  independant: "contract",
  internship: "internship",
  intern: "internship",
  stage: "internship",
  stagiair: "internship",
  temporary: "temporary",
  temp: "temporary",
  interim: "temporary",
  uitzendwerk: "temporary",
};

/**
 * Map a posting's free-text contract type onto the candidate preference
 * vocabulary. Returns `null` for anything not confidently recognised, which
 * `evaluateEligibility` treats as unstated rather than as a mismatch.
 */
export function normalizeContractType(value: string): ContractType | null {
  return CONTRACT_TYPE_ALIASES[foldText(value)] ?? null;
}

/** Language names mapped to ISO 639-1, for comparing stated requirements. */
const LANGUAGE_NAME_TO_CODE: Record<string, string> = {
  english: "en",
  engels: "en",
  anglais: "en",
  dutch: "nl",
  nederlands: "nl",
  neerlandais: "nl",
  flemish: "nl",
  french: "fr",
  frans: "fr",
  francais: "fr",
  german: "de",
  duits: "de",
  allemand: "de",
};

/** Normalise a language name or code to ISO 639-1, or null if unrecognised. */
export function normalizeLanguageToken(value: string): string | null {
  const folded = foldText(value);
  if (/^[a-z]{2}$/.test(folded)) return folded;
  return LANGUAGE_NAME_TO_CODE[folded] ?? null;
}

/**
 * Fold an employer name for the "never show me" comparison.
 *
 * Reuses the same legal-suffix stripping as ingestion's canonical key, so
 * "Example NV" and "Example" are recognised as the same employer a
 * candidate asked never to see — an exclusion that only protects the
 * candidate if it survives the legal form the source happened to use.
 */
export function foldEmployerName(value: string): string {
  return foldText(value).replace(
    /\b(nv|sa|bv|bvba|sprl|gmbh|ltd|limited|inc|plc|vzw|asbl)\b/g,
    "",
  ).trim().replace(/\s+/g, " ");
}
