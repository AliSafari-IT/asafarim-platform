import { z } from "zod";
import { tailoredResumeContentSchema, type TailoredResumeContent } from "./ai/schema";

/**
 * What the candidate changed by hand on the Tailor review screen
 * (2026-11-22): skills added or removed for this CV, and bullets they wrote
 * or rewrote themselves.
 *
 * The no-invention rule is about the AI: a model never adds a skill, an
 * employer or a claim the confirmed profile doesn't hold
 * (`mergeTailoringSuggestions`). Text the candidate types here is their own
 * claim, the same as text they type into their profile, so it is not
 * fact-checked. It stays on this one CV: nothing here is written back to
 * the profile, so a skill added for one job never shows up on the next CV
 * (or in the AI's prompt, the job-fit check or the cover-letter claim
 * check) unless the candidate adds it to their profile.
 *
 * The edits are stored beside the CV (`TailoredResume.candidateEdits`) so
 * "Regenerate" can put them back on the next review: the AI writes
 * fresh suggestions, but the candidate's own skills and bullets carry over.
 */

/** Most skills a candidate can add to one CV by hand. */
export const MAX_ADDED_SKILLS = 30;
/** Same cap as a CV entry's bullets (`tailoredResumeContentSchema`). */
export const MAX_BULLETS_PER_ROLE = 8;
/** Same cap as a provider bullet, for a bullet typed from scratch. */
export const MAX_BULLET_CHARS = 400;
/** A CV bullet's own cap: a reworded role summary may be this long. */
export const MAX_CV_BULLET_CHARS = 2000;
/** Same cap as a CV's skill list (`tailoredResumeContentSchema`). */
export const MAX_CV_SKILLS = 200;
/** Same cap as a proposed skill order (`tailorSuggestionsSchema`). */
export const MAX_PROPOSED_SKILLS = 60;
export const MAX_SKILL_CHARS = 80;
/** Same cap as an approved summary (`tailorSuggestionsSchema`). */
export const MAX_SUMMARY_CHARS = 2000;

const skillName = z.string().trim().min(1).max(MAX_SKILL_CHARS);

const ownBulletsSchema = z.object({
  title: z.string().trim().max(120),
  employer: z.string().trim().max(120).nullable().default(null),
  /** Tells two stints with the same title and employer apart. */
  startedOn: z.string().trim().max(40).nullable().default(null),
  bullets: z.array(z.string().trim().min(1).max(MAX_CV_BULLET_CHARS)).max(MAX_BULLETS_PER_ROLE),
});

export const candidateEditsSchema = z
  .object({
    addedSkills: z.array(skillName).max(MAX_ADDED_SKILLS).default([]),
    removedSkills: z.array(skillName).max(200).default([]),
    /** Bullets the candidate wrote or rewrote, per role. Matched to a role
     *  by title + employer + start date, not by position, so they still find
     *  their role when a regenerate runs on a newer profile version. */
    ownBullets: z.array(ownBulletsSchema).max(60).default([]),
    /** The summary the candidate wrote, rewrote or took from their profile
     *  instead of the AI's (0.5.0). Null when the CV keeps the AI's. Kept so
     *  "Regenerate" starts from it again instead of a fresh AI summary. */
    ownSummary: z.string().trim().min(1).max(MAX_SUMMARY_CHARS).nullable().default(null),
  })
  .strict();

export type CandidateEdits = z.infer<typeof candidateEditsSchema>;
export type OwnBullets = z.infer<typeof ownBulletsSchema>;

export const NO_CANDIDATE_EDITS: CandidateEdits = { addedSkills: [], removedSkills: [], ownBullets: [], ownSummary: null };

export function canonicalSkill(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Parses edits from a request; throws on a malformed or oversized body. */
export function parseCandidateEdits(input: unknown): CandidateEdits {
  if (input === undefined || input === null) return NO_CANDIDATE_EDITS;
  return candidateEditsSchema.parse(input);
}

/** Reads stored edits back; anything unreadable counts as no edits. */
export function readStoredCandidateEdits(input: unknown): CandidateEdits {
  const parsed = candidateEditsSchema.safeParse(input ?? {});
  return parsed.success ? parsed.data : NO_CANDIDATE_EDITS;
}

export function hasCandidateEdits(edits: CandidateEdits): boolean {
  return (
    edits.addedSkills.length > 0 ||
    edits.removedSkills.length > 0 ||
    edits.ownBullets.some((r) => r.bullets.length > 0) ||
    Boolean(edits.ownSummary)
  );
}

/**
 * The skill list for this CV: `ordered` (the profile's skills, in the
 * order the candidate chose) without the removed ones, then the added ones
 * that aren't already there. Case and spacing don't make a second copy.
 */
export function applySkillEdits(ordered: string[], edits: Pick<CandidateEdits, "addedSkills" | "removedSkills">): string[] {
  const removed = new Set(edits.removedSkills.map(canonicalSkill));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of ordered) {
    const key = canonicalSkill(name);
    if (removed.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  for (const name of edits.addedSkills) {
    const clean = name.trim().replace(/\s+/g, " ");
    const key = canonicalSkill(clean);
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

export class TooManySkillsError extends Error {
  constructor() {
    super(`A CV can hold at most ${MAX_CV_SKILLS} skills.`);
  }
}

/** Applies the skill edits to merged CV content and re-validates it. The
 *  bullets already arrive as the candidate approved them. Throws
 *  `TooManySkillsError` when the result would exceed the CV's limit. */
export function applyCandidateEdits(content: TailoredResumeContent, edits: CandidateEdits): TailoredResumeContent {
  if (edits.addedSkills.length === 0 && edits.removedSkills.length === 0) return content;
  const skills = applySkillEdits(content.skills, edits);
  if (skills.length > MAX_CV_SKILLS) throw new TooManySkillsError();
  return tailoredResumeContentSchema.parse({ ...content, skills });
}

function roleKey(role: { title: string; employer: string | null; startedOn: string | null }): string {
  return [role.title, role.employer ?? "", role.startedOn ?? ""].map((part) => part.trim().toLowerCase()).join("\u0000");
}

/**
 * The candidate's own bullets for each role of a profile, positionally.
 * A saved entry goes to the one role with the same title, employer and
 * start date; when the profile has more than one such role, it goes to
 * none, rather than copying bullets under the wrong dates.
 */
export function ownBulletsByRole(
  edits: CandidateEdits,
  roles: { title: string; employer: string | null; startedOn: string | null }[],
): string[][] {
  const counts = new Map<string, number>();
  for (const role of roles) counts.set(roleKey(role), (counts.get(roleKey(role)) ?? 0) + 1);
  return roles.map((role) => {
    const key = roleKey(role);
    if (counts.get(key) !== 1) return [];
    return edits.ownBullets.filter((row) => roleKey(row) === key).flatMap((row) => row.bullets);
  });
}
