/**
 * Hand-written types for the EduMatch matching engine (engine/matching.mjs).
 * Kept separate from the .mjs implementation so both the harness (Node) and
 * the Showcase demo (Next.js client component) get full typing without a
 * build step for this package.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

export type MatchingMode = "online" | "in-person";

export interface AvailabilitySlot {
  /** "mon" | "tue" | ... | "sun" */
  day: string;
  /** "morning" | "afternoon" | "evening" */
  block: string;
}

export interface Tutor {
  id: string;
  name: string;
  /** Neutral synthetic cohort tag used only for fairness-twin testing. */
  cohort: string;
  subjects: string[];
  levels: string[];
  languages: string[];
  modes: MatchingMode[];
  availability: AvailabilitySlot[];
  location: GeoPoint;
  serviceRadiusKm: number;
  hourlyRateCents: number;
  ratingAvg: number;
  ratingCount: number;
  verified: boolean;
}

export interface StudentNeed {
  id: string;
  label: string;
  subject: string;
  level: string;
  languages: string[];
  mode: MatchingMode;
  availability: AvailabilitySlot[];
  location: GeoPoint;
}

export interface Weights {
  distance: number;
  subject: number;
  level: number;
  rating: number;
  verified: number;
}

export interface ConstraintReason {
  code: "subject" | "level" | "language" | "availability" | "mode" | "distance";
  detail: string;
}

export interface ExcludedTutor {
  tutorId: string;
  name: string;
  reasons: ConstraintReason[];
}

export interface MatchFactor {
  key: keyof Weights;
  value: number;
  note: string;
  weight: number;
  contribution: number;
}

export interface RankedTutor {
  tutorId: string;
  name: string;
  hourlyRateCents: number;
  verified: boolean;
  composite: number;
  factors: MatchFactor[];
  rank: number;
}

export interface MatchResult {
  ranked: RankedTutor[];
  excluded: ExcludedTutor[];
}

export declare const DEFAULT_WEIGHTS: Weights;

export declare function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number;

export declare function checkConstraints(
  tutor: Tutor,
  need: StudentNeed,
): ConstraintReason[] | null;

export declare function scoreFactors(
  tutor: Tutor,
  need: StudentNeed,
): Array<{ key: keyof Weights; value: number; note: string }>;

export declare function normalizeWeights(weights: Weights): Weights;

export declare function matchTutors(
  tutors: Tutor[],
  need: StudentNeed,
  weights?: Weights,
): MatchResult;
