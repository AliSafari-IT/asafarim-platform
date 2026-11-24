import type { CandidateProfileContent } from "../profile/contract";

/**
 * Privacy-preserving prompt input, ported from the old matching product's
 * `lib/matching/embeddingInput.ts` (deleted with the pivot) — same rule,
 * same allow-list, new name since this text now feeds a tailoring prompt
 * rather than an embedding call.
 *
 * The candidate profile contract already refuses to represent protected
 * attributes (see profile/contract.ts), but it deliberately still stores
 * `fullName`, `email`, `phone`, and `baseLocation` — a candidate needs to
 * see and correct exactly what was read off their CV. None of that belongs
 * in front of an LLM: a name or email address is not a fact a tailoring
 * rewrite should ever need, and sending it outward is exactly the kind of
 * unnecessary identifier this module exists to strip before that boundary.
 *
 * `buildProfileText` is therefore the *only* approved way profile content
 * reaches a tailoring prompt. It is an allow-list, not a deny-list: every
 * field it includes is named explicitly, so a future field added to the
 * profile schema is excluded by default until someone decides it belongs
 * here.
 */

export interface ProfileTextInput {
  /** Plain text built only from professional facts, ready to prompt with. */
  text: string;
  includedFields: string[];
}

/**
 * Fields intentionally excluded, named here so the omission is a decision a
 * reader can see rather than infer from what is missing. `email` and
 * `phone` are also the source of a runtime safety net below: those two
 * formats essentially never occur coincidentally inside legitimate
 * professional text, so any match is a real leak.
 */
const EXCLUDED_FIELDS = ["email", "phone"] as const satisfies readonly (keyof CandidateProfileContent)[];

/** Lowercase and strip everything but letters and digits, so "Jordan@Example.test"
 *  and "JORDAN@EXAMPLE.TEST", or "+32 470 00 00 00" and "0470-00-00-00", compare equal. */
function canonicalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * One allow-listed piece of the profile, with a stable source id (#930).
 * Ids are positional within one immutable profile version: `exp:2` is
 * always `profile.experience[2]`, the same index the tailoring merge
 * aligns `experienceBullets` by, so evidence from one role can be traced
 * to that role and never to another.
 *
 * `body` is the free prose part (a summary) that evidence selection may
 * shorten sentence by sentence; `prefix` is structure (title, employer,
 * dates) that is always kept whole.
 */
export interface ProfileUnit {
  id: string;
  field: string;
  prefix: string;
  body: string | null;
  /** The experience index for `exp:` units, else null. */
  roleIndex: number | null;
}

/** A unit as one line of prompt text. */
export function unitText(unit: Pick<ProfileUnit, "prefix" | "body">, body: string | null = unit.body): string {
  if (!body) return unit.prefix;
  return unit.prefix ? `${unit.prefix}: ${body}` : body;
}

export function buildProfileUnits(profile: CandidateProfileContent): ProfileUnit[] {
  const units: ProfileUnit[] = [];
  const add = (id: string, field: string, prefix: string, body: string | null = null, roleIndex: number | null = null) =>
    units.push({ id, field, prefix, body, roleIndex });

  if (profile.headline) add("headline", "headline", profile.headline);
  if (profile.summary) add("summary", "summary", "", profile.summary);
  if (profile.workAuthorization) add("work_auth", "workAuthorization", `Work authorisation: ${profile.workAuthorization}.`);

  if (profile.languages.length > 0) {
    const parts = profile.languages.map((language) =>
      language.proficiency ? `${language.label} (${language.proficiency})` : language.label,
    );
    add("languages", "languages", `Languages: ${parts.join(", ")}.`);
  }

  if (profile.skills.length > 0) {
    const parts = profile.skills.map((skill) =>
      skill.yearsExperience !== null ? `${skill.name} (${skill.yearsExperience} years)` : skill.name,
    );
    add("skills", "skills", `Skills: ${parts.join(", ")}.`);
  }

  for (const [index, entry] of profile.experience.entries()) {
    const span = [entry.startedOn, entry.isCurrent ? "present" : entry.endedOn]
      .filter((value): value is string => value !== null)
      .join(" to ");
    const header = [entry.title, entry.employer ? `at ${entry.employer}` : null, span ? `(${span})` : null]
      .filter(Boolean)
      .join(" ");
    add(`exp:${index}`, `experience[${index}]`, header, entry.summary || null, index);
  }

  for (const [index, entry] of profile.education.entries()) {
    const header = [entry.qualification, entry.institution ? `from ${entry.institution}` : null]
      .filter(Boolean)
      .join(" ");
    add(`edu:${index}`, `education[${index}]`, header);
  }

  if (profile.certifications.length > 0) {
    const parts = profile.certifications.map((cert) => (cert.issuer ? `${cert.name} (${cert.issuer})` : cert.name));
    add("certs", "certifications", `Certifications: ${parts.join(", ")}.`);
  }
  return units;
}

/** The runtime safety net: throws when an excluded contact field would
 *  reach a prompt through `text`. Every prompt built from profile units
 *  runs it, whatever selection did. */
export function assertNoContactDetails(profile: CandidateProfileContent, text: string): void {
  const canonicalText = canonicalize(text);
  for (const field of EXCLUDED_FIELDS) {
    const value = profile[field];
    if (typeof value === "string" && value.length > 0 && canonicalText.includes(canonicalize(value))) {
      throw new Error(
        `buildProfileText would have leaked profile.${field} into the prompt text — refusing to return it.`,
      );
    }
  }
}

function includedFieldsOf(profile: CandidateProfileContent, units: ProfileUnit[]): string[] {
  const fields: string[] = [];
  for (const unit of units) {
    if (unit.field === "languages") profile.languages.forEach((_, i) => fields.push(`languages[${i}]`));
    else if (unit.field === "skills") profile.skills.forEach((_, i) => fields.push(`skills[${i}]`));
    else if (unit.field === "certifications") profile.certifications.forEach((_, i) => fields.push(`certifications[${i}]`));
    else fields.push(unit.field);
  }
  return fields;
}

export function buildProfileText(profile: CandidateProfileContent): ProfileTextInput {
  const units = buildProfileUnits(profile);
  const text = units.map((unit) => unitText(unit)).join("\n");
  assertNoContactDetails(profile, text);
  return { text, includedFields: includedFieldsOf(profile, units) };
}
