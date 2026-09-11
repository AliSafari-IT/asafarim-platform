/**
 * GDPR Article 8 sets the EU-wide digital-consent age at 16, but lets each
 * member state lower it, not below 13. This is the single source of truth
 * for that per-country threshold, used to decide whether a student can
 * create and manage their own EduMatch account, or needs a parent/guardian
 * to do it for them (lib/server/profiles.ts, lib/server/student-guard.ts).
 *
 * Pure and dependency-free on purpose — no "server" in the path, no Prisma —
 * so both server code and client components (the onboarding and student
 * profile forms) can import it directly.
 *
 * Sources: GDPR Art. 8(1); Belgium — Data Protection Act 2018 Art. 7 (age
 * 13); France — Loi Informatique et Libertés Art. 45 (age 15); Netherlands,
 * Luxembourg, Germany retain the GDPR default of 16. Any country not listed
 * here uses that same 16-year default — the safest option, never lower than
 * what any EU member state actually requires.
 */
export const MINOR_CONSENT_AGE_BY_COUNTRY: Record<string, number> = {
  BE: 13,
  FR: 15,
  NL: 16,
  LU: 16,
  DE: 16,
};

/** GDPR Art. 8(1) ceiling — the default for any country not listed above. */
export const DEFAULT_MINOR_CONSENT_AGE = 16;

/** Countries offered in the profile form's country selector. */
export const SUPPORTED_CONSENT_COUNTRIES = ["BE", "NL", "LU", "FR", "DE"] as const;
export type ConsentCountryCode = (typeof SUPPORTED_CONSENT_COUNTRIES)[number];

/** English display names for the selector — the form's other labels are translated, but country names aren't. */
export const CONSENT_COUNTRY_LABELS: Record<ConsentCountryCode, string> = {
  BE: "Belgium",
  NL: "Netherlands",
  LU: "Luxembourg",
  FR: "France",
  DE: "Germany",
};

/** The minimum age to self-consent in `countryCode`, or the GDPR default when unknown/unset. */
export function minorConsentAge(countryCode?: string | null): number {
  if (!countryCode) return DEFAULT_MINOR_CONSENT_AGE;
  return MINOR_CONSENT_AGE_BY_COUNTRY[countryCode.toUpperCase()] ?? DEFAULT_MINOR_CONSENT_AGE;
}

/** Whole years between `dateOfBirth` and `now`, computed in UTC. */
export function computeAgeOn(dateOfBirth: Date, now: Date): number {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dateOfBirth.getUTCMonth();
  const dayDiff = now.getUTCDate() - dateOfBirth.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
  return age;
}

/**
 * True if `dateOfBirth` puts the student below their country's digital-
 * consent age as of `now`. A missing date of birth, or one that fails to
 * parse, is the safest default — treated as below the consent age.
 */
export function isBelowConsentAge(
  dateOfBirth: Date | string | null | undefined,
  countryCode: string | null | undefined,
  now = new Date(),
): boolean {
  if (!dateOfBirth) return true;
  const dob = typeof dateOfBirth === "string" ? new Date(dateOfBirth) : dateOfBirth;
  if (Number.isNaN(dob.getTime())) return true;
  return computeAgeOn(dob, now) < minorConsentAge(countryCode);
}
