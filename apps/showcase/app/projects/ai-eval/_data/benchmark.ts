import type {
  Leaderboard,
  RunDetail,
  Regression,
  ScoringDimension,
  ScenarioMeta,
} from "./types";
import leaderboardJson from "./leaderboard.json";
import runDetailJson from "./run-detail.json";
import regressionJson from "./regression.json";

/**
 * Authored metadata + typed accessors for the generated AI-Eval fixtures.
 * Prose is human-written and stable; numbers come from the committed fixtures.
 */

export const leaderboard = leaderboardJson as Leaderboard;
export const runDetail = runDetailJson as RunDetail;
export const regression = regressionJson as Regression;

/** The three neutral benchmark scenarios (issue #6). */
const scenarioMetaBase: ScenarioMeta[] = [
  {
    key: "extraction",
    name: "showcase.aiEval.overview.scenarios.extraction.name",
    summary:
      "showcase.aiEval.overview.scenarios.extraction.summary",
  },
  {
    key: "grounded-qa",
    name: "showcase.aiEval.overview.scenarios.groundedQa.name",
    summary:
      "showcase.aiEval.overview.scenarios.groundedQa.summary",
  },
  {
    key: "tool-selection",
    name: "showcase.aiEval.overview.scenarios.toolSelection.name",
    summary:
      "showcase.aiEval.overview.scenarios.toolSelection.summary",
  },
];

export function getScenarioMeta(
  t: (key: string) => string
): ScenarioMeta[] {
  return scenarioMetaBase.map((s) => ({
    key: s.key,
    name: t(s.name),
    summary: t(s.summary),
  }));
}

/** The six scoring dimensions (issue #6). */
const dimensionsBase: ScoringDimension[] = [
  {
    key: "correctness",
    name: "showcase.aiEval.overview.dimensions.correctness.name",
    question: "showcase.aiEval.overview.dimensions.correctness.question",
    method:
      "showcase.aiEval.overview.dimensions.correctness.method",
  },
  {
    key: "groundedness",
    name: "showcase.aiEval.overview.dimensions.groundedness.name",
    question: "showcase.aiEval.overview.dimensions.groundedness.question",
    method:
      "showcase.aiEval.overview.dimensions.groundedness.method",
  },
  {
    key: "format",
    name: "showcase.aiEval.overview.dimensions.format.name",
    question: "showcase.aiEval.overview.dimensions.format.question",
    method:
      "showcase.aiEval.overview.dimensions.format.method",
  },
  {
    key: "latency",
    name: "showcase.aiEval.overview.dimensions.latency.name",
    question: "showcase.aiEval.overview.dimensions.latency.question",
    method:
      "showcase.aiEval.overview.dimensions.latency.method",
  },
  {
    key: "cost",
    name: "showcase.aiEval.overview.dimensions.cost.name",
    question: "showcase.aiEval.overview.dimensions.cost.question",
    method:
      "showcase.aiEval.overview.dimensions.cost.method",
  },
  {
    key: "safety",
    name: "showcase.aiEval.overview.dimensions.safety.name",
    question: "showcase.aiEval.overview.dimensions.safety.question",
    method:
      "showcase.aiEval.overview.dimensions.safety.method",
  },
];

export function getDimensions(
  t: (key: string) => string
): ScoringDimension[] {
  return dimensionsBase.map((d) => ({
    key: d.key,
    name: t(d.name),
    question: t(d.question),
    method: t(d.method),
  }));
}

const methodologyBase = {
  determinism:
    "showcase.aiEval.overview.method.determinism.body",
  provenance:
    "showcase.aiEval.overview.method.provenance.body",
  limitations: [
    "showcase.aiEval.overview.method.limitations.p1",
    "showcase.aiEval.overview.method.limitations.p2",
    "showcase.aiEval.overview.method.limitations.p3",
    "showcase.aiEval.overview.method.limitations.p4",
  ],
};

export function getMethodology(
  t: (key: string) => string
): { determinism: string; provenance: string; limitations: string[] } {
  return {
    determinism: t(methodologyBase.determinism),
    provenance: t(methodologyBase.provenance),
    limitations: methodologyBase.limitations.map((key) => t(key)),
  };
}
