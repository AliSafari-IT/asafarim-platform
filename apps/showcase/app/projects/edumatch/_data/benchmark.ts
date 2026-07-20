import type { BenchmarkDimension, BenchmarkScores, MatchResultEntry } from "./types";
import matchResultsJson from "./match-results.json";
import benchmarkScoresJson from "./benchmark-scores.json";

/**
 * Authored benchmark metadata + typed accessors for the generated fixtures.
 * The prose here is stable and human-written; the numbers come from the
 * committed fixtures produced by the harness (benchmarks/edumatch).
 */

export const matchResults = matchResultsJson as MatchResultEntry[];
export const benchmarkScores = benchmarkScoresJson as BenchmarkScores;

export function getMatchResult(needId: string): MatchResultEntry | undefined {
  return matchResults.find((m) => m.needId === needId);
}

/** The five dimensions EduMatch scores, straight from issue #11. */
const dimensionsBase: BenchmarkDimension[] = [
  {
    key: "matchRelevance",
    name: "showcase.edumatch.overview.dimensions.matchRelevance.name",
    question:
      "showcase.edumatch.overview.dimensions.matchRelevance.question",
  },
  {
    key: "constraintSatisfaction",
    name: "showcase.edumatch.overview.dimensions.constraintSatisfaction.name",
    question:
      "showcase.edumatch.overview.dimensions.constraintSatisfaction.question",
  },
  {
    key: "explainabilityCoverage",
    name: "showcase.edumatch.overview.dimensions.explainability.name",
    question: "showcase.edumatch.overview.dimensions.explainability.question",
  },
  {
    key: "fairness",
    name: "showcase.edumatch.overview.dimensions.fairness.name",
    question: "showcase.edumatch.overview.dimensions.fairness.question",
  },
  {
    key: "rankingStability",
    name: "showcase.edumatch.overview.dimensions.rankingStability.name",
    question:
      "showcase.edumatch.overview.dimensions.rankingStability.question",
  },
];

export function getDimensions(
  t: (key: string) => string
): BenchmarkDimension[] {
  return dimensionsBase.map((d) => ({
    key: d.key,
    name: t(d.name),
    question: t(d.question),
  }));
}

export const methodology = {
  summary:
    "EduMatch scores a transparent, weighted tutor-matching engine against synthetic students and tutors. Hard requirements (subject, level, language, availability, mode/distance) are checked first and reported by name; only tutors who pass every one are ranked, and every ranked result carries a full factor-by-factor explanation.",
  determinism:
    "The engine is pure: no database, no clock, no randomness. Every distance is Haversine over fixed synthetic coordinates, and rating is Bayesian-damped toward a neutral prior so a handful of five-star reviews cannot outrank a long, consistently strong track record.",
  weights:
    "Default weights (distance 30% · subject 25% · level 15% · rating 20% · verification 10%) are a starting point, not a fixed policy — the Match Explorer lets you move them and re-rank live, using this exact engine.",
  sensitiveAttributes:
    "The engine models qualification and logistics only: subject, level, language, availability, mode/distance, rating, and verification. It has no field for age, gender, ethnicity, disability, religion, or any other protected attribute — there is nothing to weight, by construction, not by a filter bolted on afterward.",
  limitations: [
    "Ground truth (fixtures/labels.json) is hand-reviewed against a small, hand-authored fixture set — it demonstrates the method, not statistical significance at scale.",
    "Fairness here means \"blind to an attribute the engine was never given\" (the cohort tag). It does not certify fairness across attributes a production system might inadvertently correlate with — that requires real-world data audits this benchmark cannot provide.",
    "Latency figures are representative reference timings from a fixed run, not live measurements — the engine itself runs in low single-digit milliseconds against this fixture size.",
  ],
  towardProduction: [
    "Verified identity and credential checks for tutors (background checks, qualification proof) — this benchmark's `verified` flag is a fixture boolean, not a real verification pipeline.",
    "Real payments, escrow, and dispute handling — the Journey page is a client-side simulation with no external side effects.",
    "Moderation and trust & safety tooling for messages and reviews.",
    "Data protection and consent handling appropriate to whichever real personal data a production version would collect.",
    "Fairness audits against real usage data, not just the engine's blindness to unmodelled attributes.",
  ],
};
