/**
 * Deterministic comparison helpers for two tailored-resume versions (issue
 * #434). Field-level, not a character diff — a resume's fields are short
 * discrete pieces (a headline, a skill list, one bullet per line), so
 * "does this differ" and "what was added/removed from this set" already
 * answer what a candidate wants to see side by side. No provider call, no
 * persistence: pure functions over two already-loaded
 * `TailoredResumeContent` objects.
 */
import type { TailoredResumeContent } from "./ai/schema";

export interface SkillsDiff {
  added: string[];
  removed: string[];
  common: string[];
}

/** Set-difference by skill name, case-sensitive on the stored name (skill
 *  names are already canonicalized once at merge time — see
 *  ai/schema.ts's mergeTailoringSuggestions). */
export function diffSkills(a: string[], b: string[]): SkillsDiff {
  const setA = new Set(a);
  const setB = new Set(b);
  return {
    added: b.filter((skill) => !setA.has(skill)),
    removed: a.filter((skill) => !setB.has(skill)),
    common: a.filter((skill) => setB.has(skill)),
  };
}

export interface ExperienceEntryDiff {
  title: string;
  employer: string | null;
  bulletsA: string[];
  bulletsB: string[];
  changed: boolean;
}

/**
 * Pairs experience entries by position — the same entry-ordering
 * `mergeTailoringSuggestions` already guarantees (experience order always
 * mirrors the source profile), so index alignment is meaningful as long as
 * both versions came from the same profile version. When they didn't
 * (different profile versions tailored to the same/different jobs), a
 * trailing entry present in only one side still renders — an honest
 * "no counterpart" pairing rather than a silently truncated comparison.
 */
export function diffExperience(
  a: TailoredResumeContent["experience"],
  b: TailoredResumeContent["experience"],
): ExperienceEntryDiff[] {
  const length = Math.max(a.length, b.length);
  const rows: ExperienceEntryDiff[] = [];
  for (let i = 0; i < length; i++) {
    const entryA = a[i];
    const entryB = b[i];
    const bulletsA = entryA?.bullets ?? [];
    const bulletsB = entryB?.bullets ?? [];
    rows.push({
      title: entryA?.title ?? entryB?.title ?? "",
      employer: entryA?.employer ?? entryB?.employer ?? null,
      bulletsA,
      bulletsB,
      changed: JSON.stringify(bulletsA) !== JSON.stringify(bulletsB),
    });
  }
  return rows;
}

export interface TailoredResumeDiff {
  headlineChanged: boolean;
  summaryChanged: boolean;
  skills: SkillsDiff;
  experience: ExperienceEntryDiff[];
}

export function diffTailoredResumes(a: TailoredResumeContent, b: TailoredResumeContent): TailoredResumeDiff {
  return {
    headlineChanged: a.headline !== b.headline,
    summaryChanged: a.summary !== b.summary,
    skills: diffSkills(a.skills, b.skills),
    experience: diffExperience(a.experience, b.experience),
  };
}
