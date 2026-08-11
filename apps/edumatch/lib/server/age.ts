/**
 * Age utilities, built on `EduStudentProfile.dateOfBirth` — the single
 * source of truth for every age-gated rule in EduMatch: the avatar system's
 * under-13 photo restriction (avatars.ts) and the account model's under-16
 * independence cutoff (student-guard.ts).
 *
 * All comparisons use UTC so a student's actual calendar birthday, not the
 * server's local timezone, decides when they turn a given age.
 */

/**
 * True if `dateOfBirth` puts the student under 13 as of `now`. A missing
 * date of birth is the safest default — no proof of age means "treat as the
 * youngest, most restricted case" rather than trusting an absence.
 */
export function isUnder13(dateOfBirth: Date | null | undefined, now = new Date()): boolean {
  if (!dateOfBirth) return true;
  return computeAgeOn(dateOfBirth, now) < 13;
}

/**
 * True if `dateOfBirth` puts the student under 16 as of `now` — the cutoff
 * for creating and managing an independent EduMatch account. Same safest-
 * default rule as `isUnder13`: no proof of age means under 16.
 */
export function isUnder16(dateOfBirth: Date | null | undefined, now = new Date()): boolean {
  if (!dateOfBirth) return true;
  return computeAgeOn(dateOfBirth, now) < 16;
}

/** Whole years between `dateOfBirth` and `now`, computed in UTC. */
export function computeAgeOn(dateOfBirth: Date, now: Date): number {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dateOfBirth.getUTCMonth();
  const dayDiff = now.getUTCDate() - dateOfBirth.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
  return age;
}
