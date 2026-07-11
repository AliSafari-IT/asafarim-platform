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
export const dimensions: BenchmarkDimension[] = [
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

export const methodology = {
  summary:
    "Testora measures a test-automation setup against a fixed, offline sample application that carries intentional, seeded defects. Because the system under test is deterministic, the benchmark can state exactly what a good suite should find — and prove it finds it on every run.",
  determinism:
    "Every screen renders purely from the URL query (?screen=, ?attempt=). Seeded regressions assert behaviour the app deliberately violates, so they fail on every attempt; the flake passes testInfo.retry as its attempt, so it fails first and passes on retry.",
  provenance:
    "These pages render committed fixture JSON distilled from a real Playwright run. The public demo never executes any test code. The runnable harness and CI upload the real traces, screenshots, and videos as the citable source.",
};
