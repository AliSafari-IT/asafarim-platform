import type { CandidateProfileContent } from "./contract";
import { normalizeLinkUrl } from "./links";

/**
 * "Did the candidate really change anything?" for the profile form.
 *
 * Every save of the profile writes a new immutable version (see
 * versions.ts), so a save with nothing changed used to add a version that
 * was a copy of the one before it. The form now only enables its save
 * buttons when this says the content differs from the version it opened
 * on, and the API refuses to write a copy for the same reason.
 *
 * Both sides are compared in a canonical form, so only a difference the
 * candidate would call a change counts:
 *
 * - text is trimmed, inner runs of spaces and tabs collapse to one, line
 *   endings are `\n`, and an empty string is the same as no value;
 * - rows added with "+ Add" and left empty are ignored (the save drops them
 *   too), and a link's URL is compared as it will be stored;
 * - the order of preferred locations and contract types does not matter,
 *   because they are sets; the order of roles, education, certifications,
 *   links, languages and skills does, because it is the order on the CV;
 * - a skill's `rawLabel` is ignored: the form never shows it, and retyping
 *   the skills box rewrites it without changing anything visible.
 *
 * No server or Node-only imports: the profile editor (a Client Component)
 * and the API route both use this file.
 */

function text(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalized.length > 0 ? normalized : null;
}

function filled(value: string | null | undefined): boolean {
  return text(value) !== null;
}

function sortedSet(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => text(value)).filter((value): value is string => value !== null))].sort();
}

/** The profile reduced to what the candidate can see and edit. */
export function canonicalProfile(content: CandidateProfileContent): unknown {
  const preferences = content.preferences ?? { locations: [], remote: null, contractTypes: [], salaryFloor: null, salaryCurrency: null };
  return {
    fullName: text(content.fullName),
    email: text(content.email),
    phone: text(content.phone),
    headline: text(content.headline),
    summary: text(content.summary),
    baseLocation: text(content.baseLocation),
    workAuthorization: content.workAuthorization ?? null,
    links: (content.links ?? [])
      .map((link) => ({ kind: link.kind, label: text(link.label), url: normalizeLinkUrl(link.url ?? "") }))
      .filter((link) => link.url.length > 0),
    languages: (content.languages ?? [])
      .filter((language) => filled(language.label))
      .map((language) => ({
        code: text(language.code)?.toLowerCase() ?? null,
        label: text(language.label),
        proficiency: language.proficiency ?? null,
      })),
    skills: (content.skills ?? [])
      .filter((skill) => filled(skill.name))
      .map((skill) => ({
        name: text(skill.name),
        yearsExperience: skill.yearsExperience ?? null,
        category: text(skill.category),
      })),
    experience: (content.experience ?? [])
      .filter((role) => filled(role.title))
      .map((role) => ({
        title: text(role.title),
        employer: text(role.employer),
        startedOn: text(role.startedOn),
        endedOn: text(role.endedOn),
        isCurrent: Boolean(role.isCurrent),
        summary: text(role.summary),
      })),
    education: (content.education ?? [])
      .filter((entry) => filled(entry.qualification))
      .map((entry) => ({
        qualification: text(entry.qualification),
        institution: text(entry.institution),
        completedOn: text(entry.completedOn),
      })),
    certifications: (content.certifications ?? [])
      .filter((entry) => filled(entry.name))
      .map((entry) => ({
        name: text(entry.name),
        issuer: text(entry.issuer),
        issuedOn: text(entry.issuedOn),
        expiresOn: text(entry.expiresOn),
      })),
    preferences: {
      locations: sortedSet(preferences.locations ?? []),
      remote: preferences.remote ?? null,
      contractTypes: sortedSet(preferences.contractTypes ?? []),
      salaryFloor: preferences.salaryFloor ?? null,
      salaryCurrency: text(preferences.salaryCurrency),
    },
  };
}

/** True when the two profiles differ in anything the candidate would call a change. */
export function profileHasChanges(saved: CandidateProfileContent, current: CandidateProfileContent): boolean {
  return JSON.stringify(canonicalProfile(saved)) !== JSON.stringify(canonicalProfile(current));
}
