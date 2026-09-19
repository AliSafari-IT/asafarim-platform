import type { TailoredResumeContent } from "./ai/schema";

/**
 * Deterministic resume-quality checks (issue #433). No provider call, no
 * persistence, no JM-005 gate — pure functions over `TailoredResumeContent`
 * that already exists, run identically on the fixture path. A hygiene
 * signal (does this document read well?) distinct from
 * lib/tailoring/coverage.ts's fit-to-this-posting signal.
 *
 * Deliberately not a gamified "score": each check either passes or lists
 * the specific bullets/fields that don't, so the checklist stays honest
 * about what it found rather than reducing to a single misleading number.
 */

const METRIC_PATTERN = /\d/;

// Verbs that read as passive/vague at the start of a bullet — a cheap,
// intentionally small list of the most common offenders, not an exhaustive
// grammar check.
const WEAK_LEAD_VERBS = new Set([
  "responsible", "worked", "helped", "involved", "assisted", "participated",
  "handled", "tasked", "duties", "was", "were", "did", "made", "got",
]);

const MAX_BULLET_CHARS = 220;

export interface BulletFlag {
  experienceIndex: number;
  bulletIndex: number;
  text: string;
}

export interface QualityReport {
  totalBullets: number;
  /** Bullets containing no digit at all — no metric, count, percentage, or
   *  duration to anchor the claim. */
  bulletsWithoutMetric: BulletFlag[];
  /** Bullets that open on a weak/passive verb instead of an action verb. */
  weakLeadBullets: BulletFlag[];
  /** Bullets long enough that they likely wrap to a second line in print,
   *  hurting scannability. */
  overLengthBullets: BulletFlag[];
  missingFields: ("headline" | "summary" | "email" | "phone")[];
  skillsCount: number;
  /** Rough only: fewer than this reads as thin, more reads as a keyword
   *  dump — neither is flagged as wrong, just surfaced. */
  skillsCountIsLow: boolean;
  skillsCountIsHigh: boolean;
}

const LOW_SKILLS_THRESHOLD = 4;
const HIGH_SKILLS_THRESHOLD = 25;

export function computeQuality(content: TailoredResumeContent): QualityReport {
  const bulletsWithoutMetric: BulletFlag[] = [];
  const weakLeadBullets: BulletFlag[] = [];
  const overLengthBullets: BulletFlag[] = [];
  let totalBullets = 0;

  content.experience.forEach((entry, experienceIndex) => {
    entry.bullets.forEach((text, bulletIndex) => {
      totalBullets += 1;
      const flag: BulletFlag = { experienceIndex, bulletIndex, text };

      if (!METRIC_PATTERN.test(text)) bulletsWithoutMetric.push(flag);

      const leadWord = text.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "");
      if (leadWord && WEAK_LEAD_VERBS.has(leadWord)) weakLeadBullets.push(flag);

      if (text.length > MAX_BULLET_CHARS) overLengthBullets.push(flag);
    });
  });

  const missingFields: QualityReport["missingFields"] = [];
  if (!content.headline) missingFields.push("headline");
  if (!content.summary) missingFields.push("summary");
  if (!content.email) missingFields.push("email");
  if (!content.phone) missingFields.push("phone");

  return {
    totalBullets,
    bulletsWithoutMetric,
    weakLeadBullets,
    overLengthBullets,
    missingFields,
    skillsCount: content.skills.length,
    skillsCountIsLow: content.skills.length > 0 && content.skills.length < LOW_SKILLS_THRESHOLD,
    skillsCountIsHigh: content.skills.length > HIGH_SKILLS_THRESHOLD,
  };
}
