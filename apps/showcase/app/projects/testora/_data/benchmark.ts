import type { BenchmarkDimension, RunDetail, RunsHistory } from "./types";
import runDetailJson from "./run-detail.json";
import runsJson from "./runs.json";

/**
 * Authored benchmark metadata + typed accessors for the generated fixtures.
 * The prose here is stable and human-written; the numbers come from the
 * committed fixtures produced by the harness.
 */

export const runDetail = runDetailJson as RunDetail;
export const runsHistory = runsJson as RunsHistory;

/** The five dimensions Testora scores, straight from issue #7. */
const dimensionsBase: BenchmarkDimension[] = [
  {
    key: "detection",
    name: "Detection rate",
    question: "Does the suite catch every known seeded regression?",
    method:
      "Two product defects are seeded into the sample app (un-trimmed email, tax dropped from a total). Detection = share of seeded regressions that end the run failed.",
  },
  {
    key: "flaky",
    name: "Flaky-test identification",
    question: "Can a genuine flake be told apart from a stable regression?",
    method:
      "One scenario is engineered to fail-then-pass across a retry. It must be reported as flaky, not as a passing or a hard-failing test.",
  },
  {
    key: "diagnosis",
    name: "Time to useful diagnosis",
    question: "How quickly does a failure become an actionable message?",
    method:
      "Mean wall-time across failing scenarios from start to a concise, cause-level diagnostic summary attached to the result.",
  },
  {
    key: "artifacts",
    name: "Artifact completeness",
    question: "Is every failure backed by trace, screenshot, and video?",
    method:
      "For each non-passing scenario the run must retain a Playwright trace, a screenshot, and a video. Completeness = captured / expected.",
  },
  {
    key: "reproducibility",
    name: "CI reproducibility",
    question: "Do the same inputs yield the same outcomes every run?",
    method:
      "The sample app is offline and stateless; outcomes are a pure function of the URL. Re-running the suite — and regenerating these fixtures — is byte-for-byte stable.",
  },
];

const methodologyBase = {
  summary:
    "Testora measures a test-automation setup against a fixed, offline sample application that carries intentional, seeded defects. Because the system under test is deterministic, the benchmark can state exactly what a good suite should find — and prove it finds it on every run.",
  determinism:
    "Every screen renders purely from the URL query (?screen=, ?attempt=). Seeded regressions assert behaviour the app deliberately violates, so they fail on every attempt; the flake passes testInfo.retry as its attempt, so it fails first and passes on retry.",
  provenance:
    "These pages render committed fixture JSON distilled from a real Playwright run. The public demo never executes any test code. The runnable harness and CI upload the real traces, screenshots, and videos as the citable source.",
};

export function getDimensions(t: (key: string) => string): BenchmarkDimension[] {
  return [
    {
      key: "detection",
      name: t("showcase.testora.overview.dimensions.detection.name"),
      question: t("showcase.testora.overview.dimensions.detection.question"),
      method: t("showcase.testora.overview.dimensions.detection.method"),
    },
    {
      key: "flaky",
      name: t("showcase.testora.overview.dimensions.flaky.name"),
      question: t("showcase.testora.overview.dimensions.flaky.question"),
      method: t("showcase.testora.overview.dimensions.flaky.method"),
    },
    {
      key: "diagnosis",
      name: t("showcase.testora.overview.dimensions.diagnosis.name"),
      question: t("showcase.testora.overview.dimensions.diagnosis.question"),
      method: t("showcase.testora.overview.dimensions.diagnosis.method"),
    },
    {
      key: "artifacts",
      name: t("showcase.testora.overview.dimensions.artifacts.name"),
      question: t("showcase.testora.overview.dimensions.artifacts.question"),
      method: t("showcase.testora.overview.dimensions.artifacts.method"),
    },
    {
      key: "reproducibility",
      name: t("showcase.testora.overview.dimensions.reproducibility.name"),
      question: t("showcase.testora.overview.dimensions.reproducibility.question"),
      method: t("showcase.testora.overview.dimensions.reproducibility.method"),
    },
  ];
}

export function getMethodology(t: (key: string) => string) {
  return {
    summary: t("showcase.testora.overview.methodology.summary"),
    determinism: t("showcase.testora.overview.method.determinism.body"),
    provenance: t("showcase.testora.overview.method.provenance.body"),
  };
}

export const dimensions = dimensionsBase;
export const methodology = methodologyBase;
