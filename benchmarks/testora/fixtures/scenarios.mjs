/**
 * The seed catalog — the single source of truth for the benchmark.
 *
 * Every Playwright test is tagged with a scenario `id` (the leading token of
 * its title, before the ":"). The generator (scripts/generate-fixtures.mjs)
 * joins the raw Playwright results back to these entries by that id to compute
 * the benchmark dimensions, build failure clusters, and attach the expected
 * diagnosis. Kept as plain ESM so both the .ts specs and the pure-node
 * generator import the exact same definitions.
 *
 * `kind` is the ground truth for each scenario:
 *   pass  — should pass on every attempt (baseline / correct behaviour)
 *   fail  — a seeded product defect that a good suite must DETECT (stay failed)
 *   flaky — deterministic fail-then-pass across retries within one run
 *
 * @typedef {"pass" | "fail" | "flaky"} ScenarioKind
 * @typedef {Object} Scenario
 * @property {string} id            Stable id; matches the test-title prefix.
 * @property {string} suite         Grouping shown in the demo (FR/suite).
 * @property {string} title         Human title.
 * @property {ScenarioKind} kind    Ground-truth classification.
 * @property {string} dimension     Which benchmark dimension it exercises.
 * @property {string|null} defect   Seeded product defect (fail/flaky only).
 * @property {string|null} diagnosis Concise expected diagnostic summary.
 * @property {string|null} cluster  Failure-cluster key (groups related fails).
 */

/** @type {Scenario[]} */
export const scenarios = [
  {
    id: "auth-valid-login",
    suite: "Authentication",
    title: "valid credentials create a session",
    kind: "pass",
    dimension: "baseline",
    defect: null,
    diagnosis: null,
    cluster: null,
  },
  {
    id: "auth-reject-bad-password",
    suite: "Authentication",
    title: "wrong password is rejected",
    kind: "pass",
    dimension: "baseline",
    defect: null,
    diagnosis: null,
    cluster: null,
  },
  {
    id: "auth-trim-email",
    suite: "Authentication",
    title: "email with trailing whitespace still logs in",
    kind: "fail",
    dimension: "detection",
    defect: "Email compared without trimming; a trailing space rejects a valid user.",
    diagnosis:
      "Assertion failed: expected session-badge, got login-error. Input differed from the valid email only by trailing whitespace — the comparison is not trimmed.",
    cluster: "input-normalization",
  },
  {
    id: "checkout-item-count",
    suite: "Checkout",
    title: "cart shows the correct item count",
    kind: "pass",
    dimension: "baseline",
    defect: null,
    diagnosis: null,
    cluster: null,
  },
  {
    id: "checkout-total-includes-tax",
    suite: "Checkout",
    title: "order total includes 10% tax",
    kind: "fail",
    dimension: "detection",
    defect: "Displayed total omits tax; shows the $50.00 subtotal instead of $55.00.",
    diagnosis:
      "Assertion failed: expected total $55.00, got $50.00. Difference equals the 10% tax line — tax is dropped from the displayed total.",
    cluster: "money-math",
  },
  {
    id: "dashboard-widget-loads",
    suite: "Dashboard",
    title: "dashboard widget loads on demand",
    kind: "flaky",
    dimension: "flaky-detection",
    defect: "Widget mount races an initialization signal; first attempt renders nothing.",
    diagnosis:
      "Failed on attempt 1 (widget never mounted), passed on retry. Fail-then-pass within a single run — a flake, not a stable regression.",
    cluster: "async-race",
  },
];

/** @type {Record<string, Scenario>} */
export const scenarioById = Object.fromEntries(
  scenarios.map((s) => [s.id, s]),
);

/**
 * Human-readable cluster metadata, keyed by Scenario.cluster.
 * @type {Record<string, { title: string; hint: string }>}
 */
export const clusters = {
  "input-normalization": {
    title: "Input normalization",
    hint: "User input reaches a comparison or lookup without trimming/case-folding.",
  },
  "money-math": {
    title: "Money math",
    hint: "A monetary total is assembled from parts and a component is dropped.",
  },
  "async-race": {
    title: "Async race",
    hint: "A UI element depends on an initialization signal that isn't awaited.",
  },
};
