/**
 * Types for the EduMatch benchmark fixtures. Mirror what
 * `benchmarks/edumatch/scripts/generate-fixtures.mjs` emits into this folder
 * (match-results.json, benchmark-scores.json), plus the constraint/factor
 * shapes re-declared from `benchmarks/edumatch/engine/matching.d.ts` so the
 * demo doesn't need a cross-package type import for JSON consumers.
 *
 * The demo consumes these read-only — there is no matching call, no network.
 */

export type MatchingMode = "online" | "in-person";

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
  key: "distance" | "subject" | "level" | "rating" | "verified";
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

export interface MatchResultEntry {
  needId: string;
  label: string;
  subject: string;
  level: string;
  languages: string[];
  mode: MatchingMode;
  latencyMs: number | null;
  ranked: RankedTutor[];
  excluded: ExcludedTutor[];
}

export interface BenchmarkDimensionScore {
  value: number;
  unit: string;
  method: string;
}

export interface BenchmarkScores {
  provenance: {
    source: string;
    note: string;
    runId: string;
    ref: string;
    generatedAt: string;
  };
  dimensions: {
    matchRelevance: BenchmarkDimensionScore;
    constraintSatisfaction: BenchmarkDimensionScore;
    explainabilityCoverage: BenchmarkDimensionScore;
    fairness: BenchmarkDimensionScore;
    rankingStability: BenchmarkDimensionScore;
  };
}

/** One of the five benchmark dimensions presented in the demo's overview. */
export interface BenchmarkDimension {
  key: keyof BenchmarkScores["dimensions"];
  name: string;
  question: string;
}
