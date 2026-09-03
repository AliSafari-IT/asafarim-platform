import { z } from "zod";

/**
 * The candidate profile contract (JM-020).
 *
 * This schema is the boundary between "what a CV says" and "what JobMatch
 * is willing to know". Two rules shape it:
 *
 * **1. Protected attributes are not represented.** A CV routinely carries
 * age, date of birth, nationality, gender, marital status, photographs,
 * health information, and religion — almost always unasked-for, and much of
 * it special-category data under GDPR Article 9. There is no field for any
 * of it here, so extraction has nowhere to put it and matching has nothing
 * to read. `assertNoProtectedAttributes` makes that structural rather than
 * aspirational: unknown keys are rejected, and keys that look like
 * protected attributes are rejected by name too, so a future extractor
 * cannot smuggle one in under a plausible label.
 *
 * **2. Absence is a first-class value.** Every field is optional, and
 * `null` means "the CV did not say", which is different from "the candidate
 * does not have it". M4's eligibility rules depend on that distinction:
 * excluding someone for a requirement their CV was merely silent about is
 * the single most damaging thing this product could do.
 *
 * Contact details are stored only because a candidate needs to see and
 * correct what was read, and are stripped again before anything reaches an
 * embedding or a model (JM-040).
 */

/** Bumped whenever a field's meaning changes, not merely when one is added. */
export const PROFILE_CONTRACT_VERSION = "1.0.0";

const trimmed = (max: number) => z.string().trim().min(1).max(max);

/**
 * Year, or year-month. Day precision is deliberately not accepted: CV dates
 * are rarely accurate to the day, and storing one would imply a precision
 * the source does not have. The month is bounded to 01-12 — a plain
 * `\d{2}` would accept "2026-99", which then flows into M4 date
 * comparisons as a silently nonsensical value.
 */
const YEAR_MONTH = /^\d{4}(-(0[1-9]|1[0-2]))?$/;

export const proficiencySchema = z.enum(["basic", "conversational", "professional", "native"]);

export const languageSchema = z.object({
  /** ISO 639-1 where recognised, otherwise the CV's own label. */
  code: z.string().trim().min(2).max(16),
  label: trimmed(64),
  proficiency: proficiencySchema.nullable().default(null),
});

export const skillSchema = z.object({
  name: trimmed(80),
  /** Free-text as written on the CV; normalisation to a controlled
   *  vocabulary is M4's job (JM-036) and must not erase the original. */
  rawLabel: trimmed(120).nullable().default(null),
  yearsExperience: z.number().min(0).max(60).nullable().default(null),
});

export const experienceSchema = z.object({
  title: trimmed(120),
  employer: trimmed(120).nullable().default(null),
  /** ISO year-month, e.g. "2021-03". Day precision is rarely real on a CV. */
  startedOn: z
    .string()
    .regex(YEAR_MONTH)
    .nullable()
    .default(null),
  endedOn: z
    .string()
    .regex(YEAR_MONTH)
    .nullable()
    .default(null),
  isCurrent: z.boolean().default(false),
  summary: z.string().trim().max(2000).nullable().default(null),
});

export const educationSchema = z.object({
  qualification: trimmed(160),
  institution: trimmed(160).nullable().default(null),
  completedOn: z
    .string()
    .regex(YEAR_MONTH)
    .nullable()
    .default(null),
});

export const certificationSchema = z.object({
  name: trimmed(160),
  issuer: trimmed(160).nullable().default(null),
  issuedOn: z
    .string()
    .regex(YEAR_MONTH)
    .nullable()
    .default(null),
  /** An expired certification is a hard exclusion in M4, so expiry is a
   *  field rather than something inferred from the issue date. */
  expiresOn: z
    .string()
    .regex(YEAR_MONTH)
    .nullable()
    .default(null),
});

export const workAuthorizationSchema = z.enum([
  /** Free to work in the EEA without sponsorship. */
  "eea_unrestricted",
  /** Holds a national permit tied to a country or employer. */
  "national_permit",
  /** Would need an employer to sponsor a permit. */
  "requires_sponsorship",
]);

/**
 * Preferences the candidate sets, not facts extracted from a CV. Kept in the
 * same version so a match is explainable against the preferences that were
 * actually in force at the time.
 */
export const preferencesSchema = z.object({
  /** Cities, regions, or countries the candidate will work in. */
  locations: z.array(trimmed(80)).max(20).default([]),
  remote: z.enum(["onsite", "hybrid", "remote", "any"]).nullable().default(null),
  contractTypes: z
    .array(z.enum(["permanent", "fixed_term", "contract", "internship", "temporary"]))
    .max(5)
    .default([]),
  /** Annual gross, in `salaryCurrency`. A floor, never a target. */
  salaryFloor: z.number().int().min(0).max(10_000_000).nullable().default(null),
  salaryCurrency: z.string().trim().length(3).nullable().default(null),
  /** Employers the candidate does not want to see. Honoured as a hard
   *  exclusion in M4, with no explanation shown to anyone else. */
  excludedEmployers: z.array(trimmed(120)).max(50).default([]),
});

export const candidateProfileSchema = z
  .object({
    contractVersion: z.literal(PROFILE_CONTRACT_VERSION).default(PROFILE_CONTRACT_VERSION),

    /** Shown back to the candidate for correction; stripped before any
     *  embedding or model call (JM-040). */
    fullName: trimmed(160).nullable().default(null),
    email: z.string().trim().email().max(320).nullable().default(null),
    phone: trimmed(40).nullable().default(null),

    headline: trimmed(200).nullable().default(null),
    summary: z.string().trim().max(4000).nullable().default(null),

    /** Where the candidate is based — a location fact, not a nationality. */
    baseLocation: trimmed(120).nullable().default(null),
    workAuthorization: workAuthorizationSchema.nullable().default(null),

    languages: z.array(languageSchema).max(20).default([]),
    skills: z.array(skillSchema).max(200).default([]),
    experience: z.array(experienceSchema).max(60).default([]),
    education: z.array(educationSchema).max(30).default([]),
    certifications: z.array(certificationSchema).max(40).default([]),

    preferences: preferencesSchema.default(() => preferencesSchema.parse({})),
  })
  .strict();

export type CandidateProfileContent = z.infer<typeof candidateProfileSchema>;

/** An empty, valid profile — the starting point for manual creation. */
export function emptyProfile(): CandidateProfileContent {
  return candidateProfileSchema.parse({});
}

/**
 * Key fragments that must never appear in profile content, checked against
 * a normalised form of each key so `date_of_birth`, `dateOfBirth`, and
 * `DATE-OF-BIRTH` are all caught.
 *
 * `.strict()` above already rejects unknown keys, which is the real
 * guarantee. This list is the second lock: it makes the *intent* explicit,
 * so that adding one of these fields to the schema is a decision someone
 * has to argue for and delete a line to make, rather than something that
 * slips through in a broader change.
 */
const PROTECTED_ATTRIBUTE_FRAGMENTS = [
  "age",
  "birth",
  "dob",
  "gender",
  "sex",
  "nationality",
  "citizenship",
  "ethnic",
  "race",
  "religio",
  "marital",
  "maritalstatus",
  "children",
  "dependants",
  "dependents",
  "pregnan",
  "disabilit",
  "health",
  "medical",
  "sexualorientation",
  "politic",
  "union",
  "photo",
  "photograph",
  "portrait",
  "avatar",
];

export class ProtectedAttributeError extends Error {
  readonly keys: string[];
  constructor(keys: string[]) {
    super(
      `Profile content contains keys that read as protected attributes: ${keys.join(", ")}. ` +
        "JobMatch does not store or infer these. See lib/profile/contract.ts.",
    );
    this.name = "ProtectedAttributeError";
    this.keys = keys;
  }
}

/**
 * Walk arbitrary content and reject protected-attribute keys. Runs before
 * schema parsing so the error names the actual problem instead of the
 * generic "unrecognized key".
 */
export function assertNoProtectedAttributes(input: unknown, depth = 0): void {
  if (depth > 8 || input === null || typeof input !== "object") return;

  if (Array.isArray(input)) {
    for (const item of input) assertNoProtectedAttributes(item, depth + 1);
    return;
  }

  const offending: string[] = [];
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
    // "age" is a substring of "language", "usage", "percentage"… so it is
    // matched as a whole normalised key rather than as a fragment.
    const hit = PROTECTED_ATTRIBUTE_FRAGMENTS.some((fragment) =>
      fragment === "age" || fragment === "sex" || fragment === "race" || fragment === "union"
        ? normalized === fragment
        : normalized.includes(fragment),
    );
    if (hit) offending.push(key);
    assertNoProtectedAttributes(value, depth + 1);
  }

  if (offending.length > 0) throw new ProtectedAttributeError(offending);
}

/**
 * Parse untrusted profile content — extractor output, an API body, or a row
 * read back from the database. Validated on read as well as on write,
 * because a version written by an older contract must fail loudly rather
 * than flow into matching as a half-understood shape.
 */
export function parseProfileContent(input: unknown): CandidateProfileContent {
  assertNoProtectedAttributes(input);
  return candidateProfileSchema.parse(input);
}

/**
 * Per-field extraction confidence, 0–1. Sparse by design: a field with no
 * entry is one the extractor did not attempt, which the review UI shows
 * differently from one it attempted and was unsure about.
 */
export const confidenceSchema = z.record(z.string().max(64), z.number().min(0).max(1));

export type ProfileConfidence = z.infer<typeof confidenceSchema>;

/** Below this, the review UI marks a field as needing the candidate's eye. */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;
