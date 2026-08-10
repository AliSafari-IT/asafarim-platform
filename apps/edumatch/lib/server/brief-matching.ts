/**
 * Brief-based tutor matching.
 *
 * The old `tutor-matching.ts` answers "who is nearby and teaches this
 * subject?" and returns up to 20 of them. That is a directory query. This
 * module answers a different question — "given everything we now understand
 * about this student, which at most five verified tutors should be invited to
 * prepare a proposal?" — and it answers it with an explanation attached.
 *
 * Design commitments, each of which is a product promise:
 *
 * - **At most five.** A student comparing five options makes a decision;
 *   a student comparing twenty makes a spreadsheet.
 * - **Hard filters are hard.** Subject, safeguarding clearance, and (for
 *   in-person) reachability are eligibility, not score. A tutor who cannot
 *   legally or physically take the lesson never appears, however good they are.
 * - **Position is not purchasable.** Every input below comes from verified
 *   profile facts or platform-observed behaviour. There is deliberately no
 *   "featured", "boost", or "bid" term, and `EduMatchCandidate.breakdown`
 *   persists the exact contributions so any ranking can be audited later.
 * - **New tutors get a real chance.** A qualified, verified tutor with no
 *   rating history loses every rating-weighted comparison forever unless
 *   something breaks the loop. The last slot is reserved for rotation among
 *   eligible newcomers, marked as such rather than disguised as merit.
 */

import { prisma, type Prisma } from "@asafarim/db";
import type { AvailabilityWindow, BriefFields } from "./learning-brief";
import { unverifiedTutorsExcluded } from "./tutor-verification";

export const MAX_MATCHES = 5;

/** How many of the five slots may be filled by fair rotation. */
export const ROTATION_SLOTS = 1;

/** A tutor is "new" while they have fewer than this many verified reviews. */
export const NEW_TUTOR_REVIEW_THRESHOLD = 3;

export type MatchFactor =
  | "subject"
  | "level"
  | "language"
  | "mode"
  | "schedule"
  | "rating"
  | "responsiveness"
  | "proximity";

export type MatchBreakdown = Record<MatchFactor, number>;

export type TutorCandidate = {
  tutorId: string;
  name: string | null;
  image: string | null;
  bio: string | null;
  subjectsTaught: string[];
  levelsTaught: string[];
  languagesTaught: string[];
  qualifications: string[];
  teachingStyle: string | null;
  hourlyRateCents: number;
  onlineOnly: boolean;
  ratingAvg: number;
  ratingCount: number;
  verifiedAt: Date | null;
  clearedForMinorsAt: Date | null;
  medianResponseMinutes: number | null;
  distanceKm: number | null;
  weeklyAvailability: AvailabilityWindow[];
  score: number;
  breakdown: MatchBreakdown;
  reasons: string[];
  rotationBoost: boolean;
};

export type MatchContext = {
  fields: BriefFields;
  /** Student's coordinates, when known. Null means online-only matching. */
  studentLocation: { lat: number; lng: number } | null;
  /** Safeguarding: a minor's brief only ever sees cleared tutors. */
  studentIsMinor: boolean;
  maxDistanceKm?: number;
};

/**
 * Factor weights. They sum to 1 so `score` reads as a percentage, which is
 * what the comparison UI shows the student.
 *
 * Subject and level dominate because a brilliant tutor of the wrong subject is
 * useless; schedule and responsiveness matter more than they look, because a
 * perfect match who replies in four days loses the student to their deadline.
 */
export const MATCH_WEIGHTS: MatchBreakdown = {
  subject: 0.24,
  level: 0.16,
  language: 0.14,
  mode: 0.1,
  schedule: 0.12,
  rating: 0.12,
  responsiveness: 0.06,
  proximity: 0.06,
};

// ─── Geometry ─────────────────────────────────────────────────────────────

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Individual factors ───────────────────────────────────────────────────

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** 1 for an exact subject match, 0.6 for a containment match, else 0. */
export function scoreSubject(taught: string[], wanted?: string): number {
  if (!wanted) return 0;
  const want = norm(wanted);
  const list = taught.map(norm);
  if (list.includes(want)) return 1;
  if (list.some((s) => s.includes(want) || want.includes(s))) return 0.6;
  return 0;
}

export function scoreLevel(levels: string[], wanted?: string): number {
  if (!wanted) return 0.5; // unknown level: neither reward nor punish
  return levels.map(norm).includes(norm(wanted)) ? 1 : 0;
}

/**
 * Teaching language. An undeclared language list is treated as unknown (0.5)
 * rather than as a failure, so tutors who predate the field aren't erased from
 * results the day it ships.
 */
export function scoreLanguage(taught: string[], wanted?: string): number {
  if (!wanted) return 0.5;
  if (taught.length === 0) return 0.5;
  return taught.map((l) => norm(l).slice(0, 2)).includes(norm(wanted).slice(0, 2))
    ? 1
    : 0;
}

export function scoreMode(
  tutorOnlineOnly: boolean,
  wanted?: BriefFields["mode"],
): number {
  if (!wanted || wanted === "EITHER") return 1;
  if (wanted === "ONLINE") return 1; // every tutor can teach online
  return tutorOnlineOnly ? 0 : 1; // IN_PERSON needs a tutor who travels
}

/**
 * Fraction of the student's stated availability the tutor can actually cover.
 * Both sides are recurring weekly windows, so this is a plain overlap
 * calculation — no calendar round-trip needed to rank, which is what lets the
 * student see schedule fit before any tutor has replied.
 */
export function scoreSchedule(
  tutorWindows: AvailabilityWindow[],
  studentWindows?: AvailabilityWindow[],
): number {
  if (!studentWindows || studentWindows.length === 0) return 0.5;
  if (tutorWindows.length === 0) return 0.5;

  let covered = 0;
  for (const want of studentWindows) {
    const overlaps = tutorWindows.some(
      (have) => have.day === want.day && have.from < want.to && want.from < have.to,
    );
    if (overlaps) covered += 1;
  }
  return covered / studentWindows.length;
}

/**
 * Rating, discounted by how little evidence backs it. A single five-star
 * review is not the same claim as forty, and treating them alike is how
 * marketplaces get gamed.
 */
export function scoreRating(ratingAvg: number, ratingCount: number): number {
  if (ratingCount === 0) return 0.5; // unproven, not bad
  const confidence = Math.min(ratingCount / 10, 1);
  const normalised = Math.max(0, Math.min(ratingAvg / 5, 1));
  return 0.5 + (normalised - 0.5) * confidence;
}

/** Under an hour is excellent; a day or worse scores nothing. */
export function scoreResponsiveness(medianMinutes: number | null): number {
  if (medianMinutes === null) return 0.5;
  if (medianMinutes <= 60) return 1;
  if (medianMinutes >= 24 * 60) return 0;
  return 1 - (medianMinutes - 60) / (24 * 60 - 60);
}

export function scoreProximity(
  distanceKm: number | null,
  maxDistanceKm: number,
): number {
  if (distanceKm === null) return 1; // online: distance is irrelevant, not bad
  if (distanceKm >= maxDistanceKm) return 0;
  return 1 - distanceKm / maxDistanceKm;
}

// ─── Explanation ──────────────────────────────────────────────────────────

/**
 * Short, factual reasons shown next to each tutor. Comparative claims only —
 * never "best match", because the platform is not in a position to know that
 * and saying it would make the ranking look like an endorsement.
 */
export function buildReasons(
  candidate: Omit<TutorCandidate, "reasons" | "score" | "rotationBoost">,
  fields: BriefFields,
  breakdown: MatchBreakdown,
): string[] {
  const reasons: string[] = [];

  if (breakdown.subject >= MATCH_WEIGHTS.subject) {
    reasons.push(`Teaches ${fields.subject}`);
  }
  if (breakdown.level >= MATCH_WEIGHTS.level) {
    reasons.push(`Experienced with ${fields.educationalLevel} students`);
  }
  if (fields.language && breakdown.language >= MATCH_WEIGHTS.language) {
    reasons.push(`Teaches in ${fields.language.toUpperCase()}`);
  }
  if (breakdown.schedule >= MATCH_WEIGHTS.schedule * 0.99) {
    reasons.push("Available at all the times you gave");
  } else if (breakdown.schedule > 0) {
    reasons.push("Available at some of the times you gave");
  }
  if (candidate.ratingCount >= NEW_TUTOR_REVIEW_THRESHOLD) {
    reasons.push(
      `${candidate.ratingAvg.toFixed(1)}★ from ${candidate.ratingCount} verified lessons`,
    );
  }
  if (candidate.medianResponseMinutes !== null && candidate.medianResponseMinutes <= 120) {
    reasons.push("Usually replies within two hours");
  }
  if (candidate.distanceKm !== null && candidate.distanceKm <= 10) {
    reasons.push(`${candidate.distanceKm.toFixed(1)} km away`);
  }
  return reasons.slice(0, 5);
}

// ─── Scoring ──────────────────────────────────────────────────────────────

type TutorRow = Prisma.EduTutorProfileGetPayload<{
  include: { user: { select: { id: true; name: true; image: true } } };
}>;

function readWindows(value: Prisma.JsonValue | null): AvailabilityWindow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (w): w is AvailabilityWindow =>
      !!w &&
      typeof w === "object" &&
      typeof (w as AvailabilityWindow).day === "string" &&
      typeof (w as AvailabilityWindow).from === "string" &&
      typeof (w as AvailabilityWindow).to === "string",
  );
}

export function scoreTutor(
  tutor: TutorRow,
  ctx: MatchContext,
): TutorCandidate {
  const maxDistanceKm = ctx.maxDistanceKm ?? 50;
  const { fields } = ctx;

  const distanceKm =
    ctx.studentLocation && tutor.homeLat != null && tutor.homeLng != null
      ? Math.round(
          haversineKm(
            ctx.studentLocation.lat,
            ctx.studentLocation.lng,
            tutor.homeLat,
            tutor.homeLng,
          ) * 10,
        ) / 10
      : null;

  const windows = readWindows(tutor.weeklyAvailability);

  const raw: MatchBreakdown = {
    subject: scoreSubject(tutor.subjectsTaught, fields.subject),
    level: scoreLevel(tutor.levelsTaught, fields.educationalLevel),
    language: scoreLanguage(tutor.languagesTaught, fields.language),
    mode: scoreMode(tutor.onlineOnly, fields.mode),
    schedule: scoreSchedule(windows, fields.availability),
    rating: scoreRating(tutor.ratingAvg, tutor.ratingCount),
    responsiveness: scoreResponsiveness(tutor.medianResponseMinutes),
    proximity:
      fields.mode === "ONLINE"
        ? 1
        : scoreProximity(distanceKm, maxDistanceKm),
  };

  const breakdown = Object.fromEntries(
    (Object.keys(MATCH_WEIGHTS) as MatchFactor[]).map((k) => [
      k,
      Math.round(raw[k] * MATCH_WEIGHTS[k] * 1000) / 1000,
    ]),
  ) as MatchBreakdown;

  const score =
    Math.round(
      Object.values(breakdown).reduce((sum, v) => sum + v, 0) * 1000,
    ) / 1000;

  const base = {
    tutorId: tutor.userId,
    name: tutor.user.name,
    image: tutor.user.image,
    bio: tutor.bio,
    subjectsTaught: tutor.subjectsTaught,
    levelsTaught: tutor.levelsTaught,
    languagesTaught: tutor.languagesTaught,
    qualifications: tutor.qualifications,
    teachingStyle: tutor.teachingStyle,
    hourlyRateCents: tutor.hourlyRateCents,
    onlineOnly: tutor.onlineOnly,
    ratingAvg: tutor.ratingAvg,
    ratingCount: tutor.ratingCount,
    verifiedAt: tutor.verifiedAt,
    clearedForMinorsAt: tutor.clearedForMinorsAt,
    medianResponseMinutes: tutor.medianResponseMinutes,
    distanceKm,
    weeklyAvailability: windows,
    breakdown,
  };

  return {
    ...base,
    score,
    reasons: buildReasons(base, fields, breakdown),
    rotationBoost: false,
  };
}

// ─── Eligibility ──────────────────────────────────────────────────────────

export type Ineligibility =
  | "SUBJECT"
  | "SAFEGUARDING"
  | "UNVERIFIED"
  | "OUT_OF_RANGE"
  | "MODE";

/**
 * Hard gates, evaluated before any scoring. Returning a reason rather than a
 * boolean keeps the admin matching diagnostics honest about *why* a tutor was
 * dropped — "no tutors found" with no explanation is the single most common
 * complaint about matching systems.
 */
export function ineligibilityReason(
  candidate: TutorCandidate,
  ctx: MatchContext,
): Ineligibility | null {
  if (unverifiedTutorsExcluded() && !candidate.verifiedAt) return "UNVERIFIED";
  if (ctx.studentIsMinor && !candidate.clearedForMinorsAt) return "SAFEGUARDING";
  if (candidate.breakdown.subject === 0) return "SUBJECT";
  if (ctx.fields.mode === "IN_PERSON") {
    if (candidate.onlineOnly) return "MODE";
    if (
      candidate.distanceKm !== null &&
      candidate.distanceKm > (ctx.maxDistanceKm ?? 50)
    ) {
      return "OUT_OF_RANGE";
    }
  }
  return null;
}

// ─── Selection ────────────────────────────────────────────────────────────

export function isNewTutor(c: TutorCandidate): boolean {
  return c.ratingCount < NEW_TUTOR_REVIEW_THRESHOLD;
}

/**
 * Take the top five by score, but reserve the final slot for a qualified
 * newcomer when the top four are all established tutors.
 *
 * Rotation among newcomers is by `lastMatchedAt` ascending (passed in as
 * `rotationOrder`, oldest first), so the slot circulates instead of always
 * landing on whoever signed up first. A rotated-in tutor still had to clear
 * every hard filter — this widens who gets seen, it does not lower the bar.
 */
export function selectFinalists(
  eligible: TutorCandidate[],
  rotationOrder: readonly string[],
): TutorCandidate[] {
  const ranked = [...eligible].sort((a, b) => b.score - a.score);
  if (ranked.length <= MAX_MATCHES) return ranked;

  const merit = ranked.slice(0, MAX_MATCHES - ROTATION_SLOTS);
  const meritIds = new Set(merit.map((c) => c.tutorId));

  // Already have a newcomer on merit? Then there's nothing to correct for and
  // the fifth slot goes to the next-best tutor like any other.
  if (merit.some(isNewTutor)) {
    return ranked.slice(0, MAX_MATCHES);
  }

  const rotationRank = new Map(rotationOrder.map((id, i) => [id, i]));
  const newcomer = ranked
    .filter((c) => !meritIds.has(c.tutorId) && isNewTutor(c))
    .sort(
      (a, b) =>
        (rotationRank.get(a.tutorId) ?? Number.MAX_SAFE_INTEGER) -
        (rotationRank.get(b.tutorId) ?? Number.MAX_SAFE_INTEGER),
    )[0];

  if (!newcomer) return ranked.slice(0, MAX_MATCHES);

  return [...merit, { ...newcomer, rotationBoost: true }];
}

// ─── Entry point ──────────────────────────────────────────────────────────

export type MatchResult = {
  finalists: TutorCandidate[];
  /** Why the tutors who didn't make it were dropped, for diagnostics. */
  excluded: Array<{ tutorId: string; reason: Ineligibility }>;
  consideredCount: number;
};

export async function matchTutorsForBrief(
  ctx: MatchContext,
): Promise<MatchResult> {
  const tutors = await prisma.eduTutorProfile.findMany({
    include: { user: { select: { id: true, name: true, image: true } } },
    // Bounded read: the scoring pass is in-process, so this caps the work per
    // match. Ordering by lastMatchedAt (nulls first) means tutors who have not
    // been shown recently are the ones we can always afford to consider.
    orderBy: [{ lastMatchedAt: { sort: "asc", nulls: "first" } }],
    take: 500,
  });

  const scored = tutors.map((t) => scoreTutor(t, ctx));

  const eligible: TutorCandidate[] = [];
  const excluded: MatchResult["excluded"] = [];
  for (const candidate of scored) {
    const reason = ineligibilityReason(candidate, ctx);
    if (reason) excluded.push({ tutorId: candidate.tutorId, reason });
    else eligible.push(candidate);
  }

  // `tutors` is already ordered oldest-match-first, which is exactly the
  // rotation order we want.
  const rotationOrder = tutors.map((t) => t.userId);
  const finalists = selectFinalists(eligible, rotationOrder);

  return { finalists, excluded, consideredCount: scored.length };
}

/**
 * Persist the selection. Candidates are replaced wholesale on re-match so the
 * stored set is always the one currently shown to the student — a stale
 * candidate row would mean an invited tutor the student can no longer see.
 */
export async function saveMatchCandidates(
  briefId: string,
  finalists: TutorCandidate[],
  quoteRequestId?: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.eduMatchCandidate.deleteMany({ where: { briefId } }),
    prisma.eduMatchCandidate.createMany({
      data: finalists.map((c, i) => ({
        briefId,
        quoteRequestId: quoteRequestId ?? null,
        tutorId: c.tutorId,
        rank: i + 1,
        score: c.score,
        breakdown: c.breakdown as unknown as Prisma.InputJsonValue,
        reasons: c.reasons,
        rotationBoost: c.rotationBoost,
        invitedAt: quoteRequestId ? new Date() : null,
      })),
    }),
    prisma.eduTutorProfile.updateMany({
      where: { userId: { in: finalists.map((c) => c.tutorId) } },
      data: { lastMatchedAt: new Date(), invitesReceived: { increment: 1 } },
    }),
  ]);
}
