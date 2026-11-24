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
  /** The wording it started with (the AI's, or the profile's role
   *  summary), or null for a bullet the candidate wrote. */
  aiText: string | null;
  /** The profile's own role summary, shown because the AI wrote no
   *  bullets for this role. */
  fromProfile?: boolean;
  /** #930: labels of the sources an AI bullet cites (the candidate's own
   *  role and evidence names, never model text). */
  sources?: string[];
  /** #930: why the claim check flagged an AI bullet; empty or missing when
   *  it passed. A flagged bullet starts unticked. */
  flags?: string[];
}

/** #930: what the claim check said about one AI bullet. */
export interface ReviewBulletMeta {
  sources: string[];
  flags: string[];
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
 * the per-role cap. A role the AI wrote no bullets for shows the profile's
 * own role summary as its first bullet instead, so adding a bullet keeps
 * it rather than silently replacing it.
 */
export function buildReviewBullets(
  aiBullets: string[],
  ownBullets: string[],
  profileSummary: string | null,
  nextKey: () => string,
  /** #930: aligned with `aiBullets`. A flagged bullet starts unticked:
   *  the candidate keeps it only by choosing to. */
  aiMeta: (ReviewBulletMeta | undefined)[] = [],
): ReviewBullet[] {
  const bullets: ReviewBullet[] = [];
  const summary = profileSummary?.trim();
  const own = new Set(ownBullets.map((text) => text.trim()));
  if (aiBullets.length === 0 && summary && !own.has(summary)) {
    bullets.push({ key: nextKey(), text: summary, accepted: true, aiText: summary, fromProfile: true });
  }
  for (const text of ownBullets) {
    bullets.push({ key: nextKey(), text, accepted: acceptedBulletCount(bullets) < MAX_BULLETS_PER_ROLE, aiText: null });
  }
  aiBullets.forEach((text, index) => {
    const meta = aiMeta[index];
    const flagged = (meta?.flags.length ?? 0) > 0;
    bullets.push({
      key: nextKey(),
      text,
      accepted: !flagged && acceptedBulletCount(bullets) < MAX_BULLETS_PER_ROLE,
      aiText: text,
      ...(meta ? { sources: meta.sources, flags: meta.flags } : {}),
    });
  });
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
