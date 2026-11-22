import { canonicalSkill, MAX_BULLETS_PER_ROLE, type CandidateEdits } from "./candidateEdits";

/**
 * Pure helpers for the Tailor review screen's hand edits (2026-11-22):
 * the skills the candidate adds or removes, and the bullets they rewrite
 * or write themselves. See lib/tailoring/candidateEdits.ts for the rules.
 */

export interface ReviewBullet {
  /** Stable React key; never sent anywhere. */
  key: string;
  text: string;
  accepted: boolean;
  /** The AI's own wording, or null for a bullet the candidate wrote. */
  aiText: string | null;
}

/**
 * The profile's skills in the order the AI proposed, the same way
 * `mergeTailoringSuggestions` will save them: names the profile doesn't
 * hold are dropped, and profile skills the AI left out follow at the end.
 */
export function orderProfileSkills(proposed: string[], profileSkills: string[]): string[] {
  const byKey = new Map(profileSkills.map((name) => [name.trim().toLowerCase(), name]));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [...proposed, ...profileSkills]) {
    const key = name.trim().toLowerCase();
    const real = byKey.get(key);
    if (real && !seen.has(key)) {
      seen.add(key);
      out.push(real);
    }
  }
  return out;
}

/** Edits from a saved CV, limited to what still makes sense against the
 *  current profile: only profile skills can be removed, and a skill the
 *  profile now holds needs no adding. */
export function seedSkillEdits(
  edits: Pick<CandidateEdits, "addedSkills" | "removedSkills">,
  profileSkills: string[],
): { addedSkills: string[]; removedSkills: string[] } {
  const inProfile = new Set(profileSkills.map(canonicalSkill));
  return {
    addedSkills: edits.addedSkills.filter((name) => !inProfile.has(canonicalSkill(name))),
    removedSkills: profileSkills.filter((name) =>
      edits.removedSkills.some((removed) => canonicalSkill(removed) === canonicalSkill(name)),
    ),
  };
}

/**
 * One role's bullets for review: the candidate's own (from a regenerated
 * CV) first and ticked, then the AI's, ticked while there is room under
 * the per-role cap.
 */
export function buildReviewBullets(aiBullets: string[], ownBullets: string[], nextKey: () => string): ReviewBullet[] {
  const bullets: ReviewBullet[] = ownBullets.map((text) => ({ key: nextKey(), text, accepted: true, aiText: null }));
  for (const text of aiBullets) {
    const accepted = bullets.filter((b) => b.accepted).length < MAX_BULLETS_PER_ROLE;
    bullets.push({ key: nextKey(), text, accepted, aiText: text });
  }
  return bullets;
}

/** Written or reworded by the candidate, so it is theirs to keep. */
export function isOwnBullet(bullet: ReviewBullet): boolean {
  return bullet.aiText === null || bullet.text.trim() !== bullet.aiText.trim();
}

export function acceptedBulletCount(bullets: ReviewBullet[]): number {
  return bullets.filter((b) => b.accepted).length;
}

/** What goes on the CV for this role: ticked, non-empty, in order. */
export function approvedBullets(bullets: ReviewBullet[]): string[] {
  return bullets
    .filter((b) => b.accepted && b.text.trim())
    .map((b) => b.text.trim())
    .slice(0, MAX_BULLETS_PER_ROLE);
}

/** The approved bullets the candidate wrote or rewrote — the ones a
 *  regenerate carries over. */
export function approvedOwnBullets(bullets: ReviewBullet[]): string[] {
  return bullets
    .filter((b) => b.accepted && b.text.trim() && isOwnBullet(b))
    .map((b) => b.text.trim())
    .slice(0, MAX_BULLETS_PER_ROLE);
}

/** A typed skill, cleaned up; null when it is empty. */
export function cleanSkillInput(raw: string): string | null {
  const clean = raw.trim().replace(/\s+/g, " ");
  return clean ? clean : null;
}
