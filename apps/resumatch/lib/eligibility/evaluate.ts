import type { CandidateProfileContent } from "../profile/contract";
import { foldEmployerName, locationMatchesAny, normalizeContractType } from "./vocabulary";

/**
 * Deterministic eligibility (JM-033, JM-034).
 *
 * A hard exclusion is a claim about the candidate that could be wrong, so
 * this module holds itself to one rule above all others: **absence is never
 * failure.** If the candidate did not state a preference, or the posting
 * did not state a fact, that axis is skipped rather than guessed. Excluding
 * someone from a job their CV was merely silent about is, in the business
 * plan's own words, the single most damaging thing this product could do.
 *
 * Every exclusion carries a reason code rather than a sentence, so the UI
 * controls the wording and a translation never drifts from the logic that
 * produced it. `RULES_VERSION` is bumped whenever a rule's *behaviour*
 * changes, and it travels with every result — not because a decision is
 * stored anywhere, but because none needs to be. A decision is a pure
 * function of the candidate's confirmed profile version, the posting's own
 * content hash, and this version number, all three of which are already
 * immutable and already persisted. Recomputing it later reproduces it
 * exactly, which is what "persisted" is actually for.
 */

export const RULES_VERSION = "1.0.0";

export type ExclusionReasonCode =
  | "REQUIRES_SPONSORSHIP_NOT_OFFERED"
  | "LANGUAGE_NOT_MET"
  | "CERTIFICATION_NOT_MET"
  | "REMOTE_ONLY_PREFERENCE"
  | "LOCATION_NOT_MATCHED"
  | "BELOW_SALARY_FLOOR"
  | "CONTRACT_TYPE_NOT_WANTED";

export interface ExclusionReason {
  code: ExclusionReasonCode;
  /** Plain-language explanation, built from data already on the posting —
   *  never a raw source string, so it cannot leak more than the reason itself. */
  message: string;
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: ExclusionReason[];
  rulesVersion: string;
}

/** The subset of a JobPosting eligibility needs, kept independent of Prisma's
 *  generated type so this module has no database dependency. */
export interface PostingForEligibility {
  employer: string;
  locationRaw: string | null;
  isRemote: boolean | null;
  contractType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  requiresSponsorship: boolean | null;
  languageRequired: string[];
  requiredCertifications: string[];
}

function today(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Evaluate one posting against one confirmed profile. Pure, and safe to call
 * for every posting in a search result: no I/O, and cheap enough that there
 * is no reason to cache it.
 */
export function evaluateEligibility(
  profile: CandidateProfileContent,
  posting: PostingForEligibility,
): EligibilityResult {
  const reasons: ExclusionReason[] = [];

  // Work authorisation. Only an explicit "we do not sponsor" on a role the
  // candidate would need sponsorship for is a hard fact; everything short of
  // that is silence, and silence does not exclude.
  if (posting.requiresSponsorship === false && profile.workAuthorization === "requires_sponsorship") {
    reasons.push({
      code: "REQUIRES_SPONSORSHIP_NOT_OFFERED",
      message: "This role does not offer visa sponsorship.",
    });
  }

  // Language. Excludes only when the posting names a requirement AND the
  // candidate has stated languages that share none of it — a candidate who
  // left their languages blank is not assumed to speak nothing.
  if (posting.languageRequired.length > 0 && profile.languages.length > 0) {
    const spoken = new Set(profile.languages.map((language) => language.code));
    const meetsAny = posting.languageRequired.some((code) => spoken.has(code));
    if (!meetsAny) {
      reasons.push({
        code: "LANGUAGE_NOT_MET",
        message: `Requires ${posting.languageRequired.join(" or ").toUpperCase()}, not listed on your profile.`,
      });
    }
  }

  // Certification. The posting naming a requirement the candidate does not
  // hold at all, or holds only in an expired form, is a genuine failed
  // requirement — not an absence to be forgiving about, because the posting
  // was specific about what it needs.
  if (posting.requiredCertifications.length > 0 && profile.certifications.length > 0) {
    const required = new Set(posting.requiredCertifications.map((name) => name.toLowerCase()));
    const held = profile.certifications.filter((cert) => required.has(cert.name.toLowerCase()));
    const currentlyHeld = held.filter((cert) => !cert.expiresOn || cert.expiresOn >= today());
    if (currentlyHeld.length === 0) {
      reasons.push({
        code: "CERTIFICATION_NOT_MET",
        message:
          held.length > 0
            ? `Requires ${posting.requiredCertifications.join(", ")}, which has expired on your profile.`
            : `Requires ${posting.requiredCertifications.join(", ")}, not listed on your profile.`,
      });
    }
  }

  // Location and remote preference.
  const wantsRemoteOnly = profile.preferences.remote === "remote";
  if (wantsRemoteOnly && posting.isRemote === false) {
    reasons.push({
      code: "REMOTE_ONLY_PREFERENCE",
      message: "You are looking for remote-only roles, and this one is on site.",
    });
  } else if (
    profile.preferences.locations.length > 0 &&
    posting.isRemote !== true &&
    posting.locationRaw &&
    !locationMatchesAny(profile.preferences.locations, posting.locationRaw)
  ) {
    reasons.push({
      code: "LOCATION_NOT_MATCHED",
      message: `Outside the locations on your profile (${profile.preferences.locations.join(", ")}).`,
    });
  }

  // Salary floor. Compared only when both sides carry a usable number, the
  // currencies are both stated and agree, and the posting is explicitly
  // annual — the profile's floor has no basis for converting an hourly or
  // monthly figure, so anything else is treated as unable to compare rather
  // than guessed at.
  if (
    profile.preferences.salaryFloor !== null &&
    posting.salaryMax !== null &&
    posting.salaryPeriod === "year" &&
    profile.preferences.salaryCurrency !== null &&
    posting.salaryCurrency !== null &&
    profile.preferences.salaryCurrency === posting.salaryCurrency &&
    posting.salaryMax < profile.preferences.salaryFloor
  ) {
    reasons.push({
      code: "BELOW_SALARY_FLOOR",
      message:
        `Below your salary floor of ${profile.preferences.salaryFloor.toLocaleString()} ${profile.preferences.salaryCurrency ?? ""}`.trim(),
    });
  }

  // Contract type. The posting's free text is normalised for comparison
  // only; an unrecognised value is treated as unstated rather than a
  // mismatch, because guessing wrong here would hide a job over a labelling
  // difference rather than a real one.
  if (profile.preferences.contractTypes.length > 0 && posting.contractType) {
    const normalized = normalizeContractType(posting.contractType);
    if (normalized && !profile.preferences.contractTypes.includes(normalized)) {
      reasons.push({
        code: "CONTRACT_TYPE_NOT_WANTED",
        message: `This is a ${posting.contractType} role, outside what you are looking for.`,
      });
    }
  }

  return { eligible: reasons.length === 0, reasons, rulesVersion: RULES_VERSION };
}

/**
 * Whether a posting should be hidden from search results entirely, rather
 * than shown with an exclusion reason.
 *
 * This is deliberately a *different* function from `evaluateEligibility`,
 * and the distinction is a promise made on the profile page: "Kept private.
 * Nobody is told you excluded them." An employer the candidate opted out of
 * must not appear at all — not even annotated as ineligible, which would
 * still reveal that the candidate looked at it. Every other exclusion is
 * shown *with its reason*, on purpose: a candidate who sees "requires
 * sponsorship" learns something about their own profile or the market that
 * silently hiding the job would not have told them.
 */
export function isOptedOut(profile: CandidateProfileContent, employer: string): boolean {
  if (profile.preferences.excludedEmployers.length === 0) return false;
  const folded = foldEmployerName(employer);
  return profile.preferences.excludedEmployers.some(
    (excluded) => foldEmployerName(excluded) === folded,
  );
}
