import type { CandidateProfileContent } from "../profile/contract";

/**
 * Privacy-preserving embedding input (JM-040).
 *
 * The candidate profile contract already refuses to represent protected
 * attributes (see profile/contract.ts), but it deliberately still stores
 * `fullName`, `email`, `phone`, and `baseLocation` — a candidate needs to
 * see and correct exactly what was read off their CV. None of that belongs
 * in front of an embedding model or an LLM: a name or email address is not
 * a professional fact any matching decision should turn on, and sending it
 * outward is exactly the kind of unnecessary identifier this module exists
 * to strip before that boundary.
 *
 * `buildEmbeddingInput` is therefore the *only* approved way profile
 * content reaches an embedding call or a prompt. It is an allow-list, not a
 * deny-list: every field it includes is named explicitly, so a future field
 * added to the profile schema is excluded by default until someone decides
 * it belongs here — the opposite failure mode from a deny-list, where a new
 * field leaks by default until someone remembers to add it.
 */

export interface EmbeddingInput {
  /** Plain text built only from professional facts, ready to embed. */
  text: string;
  /** Which profile fields contributed, for MatchEvidence.profileField
   *  references to point at — see lib/matching/contract.ts. */
  includedFields: string[];
}

/**
 * Fields intentionally excluded, named here so the omission is a decision a
 * reader can see rather than infer from what is missing. `email` and
 * `phone` are also the source of a runtime safety net below: those two
 * formats essentially never occur coincidentally inside legitimate
 * professional text, so any match is a real leak.
 *
 * `fullName` and `baseLocation` are deliberately *not* checked at runtime.
 * A city legitimately recurs in an employer or institution name ("Ghent
 * University"), and a name can legitimately be part of one too ("Jordan
 * Motors") — a substring check on either would throw on real profiles for
 * text that was never leaked from the excluded field at all. The allow-list
 * construction above is what actually keeps them out (verified by
 * embeddingInput.test.ts); this check exists only for identifiers precise
 * enough that a false positive is not a realistic concern.
 */
const EXCLUDED_FIELDS = ["email", "phone"] as const satisfies readonly (keyof CandidateProfileContent)[];

/** Lowercase and strip everything but letters and digits, so "Jordan@Example.test"
 *  and "JORDAN@EXAMPLE.TEST", or "+32 470 00 00 00" and "0470-00-00-00", compare equal. */
function canonicalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function buildEmbeddingInput(profile: CandidateProfileContent): EmbeddingInput {
  const lines: string[] = [];
  const includedFields: string[] = [];

  if (profile.headline) {
    lines.push(profile.headline);
    includedFields.push("headline");
  }
  if (profile.summary) {
    lines.push(profile.summary);
    includedFields.push("summary");
  }
  if (profile.workAuthorization) {
    lines.push(`Work authorisation: ${profile.workAuthorization}.`);
    includedFields.push("workAuthorization");
  }

  if (profile.languages.length > 0) {
    const parts = profile.languages.map((language, index) => {
      includedFields.push(`languages[${index}]`);
      return language.proficiency ? `${language.label} (${language.proficiency})` : language.label;
    });
    lines.push(`Languages: ${parts.join(", ")}.`);
  }

  if (profile.skills.length > 0) {
    const parts = profile.skills.map((skill, index) => {
      includedFields.push(`skills[${index}]`);
      return skill.yearsExperience !== null
        ? `${skill.name} (${skill.yearsExperience} years)`
        : skill.name;
    });
    lines.push(`Skills: ${parts.join(", ")}.`);
  }

  for (const [index, entry] of profile.experience.entries()) {
    const span = [entry.startedOn, entry.isCurrent ? "present" : entry.endedOn]
      .filter((value): value is string => value !== null)
      .join(" to ");
    const header = [entry.title, entry.employer ? `at ${entry.employer}` : null, span ? `(${span})` : null]
      .filter(Boolean)
      .join(" ");
    lines.push(entry.summary ? `${header}: ${entry.summary}` : header);
    includedFields.push(`experience[${index}]`);
  }

  for (const [index, entry] of profile.education.entries()) {
    const header = [entry.qualification, entry.institution ? `from ${entry.institution}` : null]
      .filter(Boolean)
      .join(" ");
    lines.push(header);
    includedFields.push(`education[${index}]`);
  }

  if (profile.certifications.length > 0) {
    const parts = profile.certifications.map((cert, index) => {
      includedFields.push(`certifications[${index}]`);
      return cert.issuer ? `${cert.name} (${cert.issuer})` : cert.name;
    });
    lines.push(`Certifications: ${parts.join(", ")}.`);
  }

  const text = lines.join("\n");
  const canonicalText = canonicalize(text);
  for (const field of EXCLUDED_FIELDS) {
    const value = profile[field];
    if (typeof value === "string" && value.length > 0 && canonicalText.includes(canonicalize(value))) {
      throw new Error(
        `buildEmbeddingInput would have leaked profile.${field} into the embedding text — refusing to return it.`,
      );
    }
  }

  return { text, includedFields };
}
