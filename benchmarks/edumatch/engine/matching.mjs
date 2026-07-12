/*
 * EduMatch matching engine — the domain insight ported from the legacy app
 * (asafarim-digital/apps/edumatch/lib/server/tutor-matching.ts), restructured
 * around one requirement the legacy version only gestured at: EXPLAINABILITY.
 *
 * Design rules:
 *  - Pure and deterministic: no Date.now(), no randomness, no I/O. Same inputs
 *    always produce byte-identical outputs (ties broken by tutor id).
 *  - Hard constraints are checked FIRST and separately from scoring. A tutor
 *    excluded by a constraint is never ranked, and the exclusion carries a
 *    machine-readable reason — "why not" is part of the explanation.
 *  - Every ranked result carries a complete factor breakdown (value × weight =
 *    contribution) that sums exactly to its composite score.
 *  - Weights are an input, not a constant, so a UI can let users adjust them
 *    and re-rank live. DEFAULT_WEIGHTS preserves the legacy tuning.
 *
 * This module is plain ESM so the Node test runner, the fixture generator, and
 * the Next.js client demo all import the exact same implementation.
 */

/**
 * Legacy composite weights (tutor-matching.ts): distance .30, subject .25,
 * level .15, rating .20, verification .10.
 */
export const DEFAULT_WEIGHTS = Object.freeze({
  distance: 0.3,
  subject: 0.25,
  level: 0.15,
  rating: 0.2,
  verified: 0.1,
});

/** Ported from the legacy implementation (Haversine, km). */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const round3 = (n) => Math.round(n * 1000) / 1000;
const round1 = (n) => Math.round(n * 10) / 10;

/** Do two availability slot lists share at least one (day, block) slot? */
function availabilityOverlap(a, b) {
  return a.some((sa) => b.some((sb) => sa.day === sb.day && sa.block === sb.block));
}

/**
 * Hard constraints. Returns null when the tutor is eligible, otherwise a list
 * of machine-readable reasons — every reason is reported, not just the first.
 *
 * Constraint order (documented in docs/edumatch-benchmark.md):
 *   subject → level → language → availability → mode/distance
 */
export function checkConstraints(tutor, need) {
  const reasons = [];

  if (!tutor.subjects.includes(need.subject)) {
    reasons.push({ code: "subject", detail: `does not teach ${need.subject}` });
  }
  if (!tutor.levels.includes(need.level)) {
    reasons.push({ code: "level", detail: `does not teach at ${need.level} level` });
  }
  if (!tutor.languages.some((l) => need.languages.includes(l))) {
    reasons.push({ code: "language", detail: "no shared language" });
  }
  if (!availabilityOverlap(tutor.availability, need.availability)) {
    reasons.push({ code: "availability", detail: "no overlapping availability slot" });
  }

  if (need.mode === "online") {
    if (!tutor.modes.includes("online")) {
      reasons.push({ code: "mode", detail: "does not teach online" });
    }
  } else {
    // in-person: tutor must offer in-person AND the student must sit inside
    // the tutor's service radius.
    if (!tutor.modes.includes("in-person")) {
      reasons.push({ code: "mode", detail: "does not teach in person" });
    } else {
      const d = haversineKm(need.location.lat, need.location.lng, tutor.location.lat, tutor.location.lng);
      if (d > tutor.serviceRadiusKm) {
        reasons.push({
          code: "distance",
          detail: `${round1(d)} km away, outside the ${tutor.serviceRadiusKm} km service radius`,
        });
      }
    }
  }

  return reasons.length > 0 ? reasons : null;
}

/**
 * Per-factor scores, each 0–1, each with a human-readable note.
 * Kept separate from weighting so the breakdown can show raw factor quality
 * next to its weighted contribution.
 */
export function scoreFactors(tutor, need) {
  // Distance: closer is better; online needs make distance irrelevant (full
  // score) rather than silently favouring nearby tutors.
  let distanceValue = 1;
  let distanceNote = "online — distance not a factor";
  if (need.mode === "in-person") {
    const d = haversineKm(need.location.lat, need.location.lng, tutor.location.lat, tutor.location.lng);
    distanceValue = round3(Math.max(0, 50 - d) / 50); // legacy curve
    distanceNote = `${round1(d)} km from student`;
  }

  // Subject: exact primary-subject specialists beat generalists who list the
  // subject among many (legacy gave flat 1/0.3; this keeps the constraint
  // guarantee — the subject IS taught — and grades specialisation).
  const subjectCount = tutor.subjects.length;
  const subjectValue = round3(subjectCount <= 2 ? 1 : subjectCount <= 4 ? 0.85 : 0.7);
  const subjectNote = `teaches ${need.subject} among ${subjectCount} subject(s)`;

  // Level fit: teaching the exact level plus adjacent levels suggests range;
  // constraint already guarantees the level is covered.
  const levelValue = round3(tutor.levels.length >= 2 ? 1 : 0.9);
  const levelNote = `covers ${need.level}${tutor.levels.length >= 2 ? " and other levels" : " only"}`;

  // Rating: Bayesian damping toward a 3.5 prior so a 5.0 from 2 reviews does
  // not beat a 4.8 from 40 (the legacy rating/5 had this exact failure mode).
  const PRIOR = 3.5;
  const PRIOR_COUNT = 5;
  const damped = (tutor.ratingAvg * tutor.ratingCount + PRIOR * PRIOR_COUNT) / (tutor.ratingCount + PRIOR_COUNT);
  const ratingValue = round3(Math.min(damped / 5, 1));
  const ratingNote = `${tutor.ratingAvg.toFixed(1)}★ over ${tutor.ratingCount} review(s), damped to ${damped.toFixed(2)}`;

  const verifiedValue = tutor.verified ? 1 : 0;
  const verifiedNote = tutor.verified ? "identity and credentials verified" : "not verified";

  return [
    { key: "distance", value: distanceValue, note: distanceNote },
    { key: "subject", value: subjectValue, note: subjectNote },
    { key: "level", value: levelValue, note: levelNote },
    { key: "rating", value: ratingValue, note: ratingNote },
    { key: "verified", value: verifiedValue, note: verifiedNote },
  ];
}

/** Normalize weights so contributions always sum to a 0–1 composite. */
export function normalizeWeights(weights) {
  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  if (total <= 0) return { ...DEFAULT_WEIGHTS };
  const out = {};
  for (const [k, v] of Object.entries(weights)) out[k] = v / total;
  return out;
}

/**
 * Rank all tutors for a student need.
 *
 * Returns { ranked, excluded }:
 *  - ranked: eligible tutors sorted by composite desc (ties: tutor id asc so
 *    ordering is total and deterministic), each with rank, composite, and the
 *    full factor breakdown.
 *  - excluded: ineligible tutors with every constraint reason.
 */
export function matchTutors(tutors, need, weights = DEFAULT_WEIGHTS) {
  const w = normalizeWeights(weights);
  const ranked = [];
  const excluded = [];

  for (const tutor of tutors) {
    const reasons = checkConstraints(tutor, need);
    if (reasons) {
      excluded.push({ tutorId: tutor.id, name: tutor.name, reasons });
      continue;
    }

    const factors = scoreFactors(tutor, need).map((f) => ({
      ...f,
      weight: round3(w[f.key]),
      contribution: round3(f.value * w[f.key]),
    }));
    const composite = round3(factors.reduce((s, f) => s + f.contribution, 0));

    ranked.push({
      tutorId: tutor.id,
      name: tutor.name,
      hourlyRateCents: tutor.hourlyRateCents,
      verified: tutor.verified,
      composite,
      factors,
    });
  }

  ranked.sort((a, b) => b.composite - a.composite || (a.tutorId < b.tutorId ? -1 : 1));
  ranked.forEach((r, i) => {
    r.rank = i + 1;
  });

  return { ranked, excluded };
}
