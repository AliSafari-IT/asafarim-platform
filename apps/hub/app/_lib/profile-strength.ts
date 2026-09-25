/**
 * Share of the profile that is filled in, 0–100. Used by the profile page's
 * identity panel (live, as you type) and the dashboard tile (server-side), so
 * both always report the same number.
 */
export interface ProfileStrengthInput {
  name?: string | null;
  username?: string | null;
  image?: string | null;
  bio?: string | null;
  jobTitle?: string | null;
  company?: string | null;
  website?: string | null;
  phone?: string | null;
  timezone?: string | null;
  locationCount: number;
}

export function profileStrength(p: ProfileStrengthInput): number {
  const checks = [
    p.name,
    p.username,
    p.image,
    p.bio,
    p.jobTitle,
    p.company,
    p.website,
    p.phone,
    p.timezone,
    p.locationCount > 0,
  ].map(Boolean);
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
