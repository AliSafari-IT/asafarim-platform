import assert from "node:assert/strict";
import { test } from "node:test";
import { consecutivePassCount, evaluateGreenLight, type ScenarioStanding } from "./greenlight";

function scenario(overrides: Partial<ScenarioStanding> = {}): ScenarioStanding {
  return {
    scenarioId: "scn_1",
    criterionRef: "ac_1",
    state: "active",
    quarantined: false,
    recentResults: [{ status: "passed" }, { status: "passed" }, { status: "passed" }],
    hasCompleteArtifacts: true,
    ...overrides,
  };
}

test("consecutivePassCount stops at the first non-pass and caps at N", () => {
  assert.equal(consecutivePassCount([{ status: "passed" }, { status: "passed" }], 3), 2);
  assert.equal(
    consecutivePassCount([{ status: "passed" }, { status: "failed" }, { status: "passed" }], 3),
    1,
  );
  assert.equal(consecutivePassCount(Array(5).fill({ status: "passed" }), 3), 3);
  assert.equal(consecutivePassCount([], 3), 0);
});

test("green: every counted scenario clean for requiredRuns, zero flakes, complete artifacts", () => {
  const v = evaluateGreenLight([scenario(), scenario({ scenarioId: "scn_2", criterionRef: "ac_2" })], 3);
  assert.equal(v.verdict, "green");
  assert.equal(v.cleanRuns, 3);
  assert.equal(v.flakeCount, 0);
  assert.equal(v.artifactsComplete, true);
});

test("a single flake (one fail in the window) keeps it un-satisfied", () => {
  const v = evaluateGreenLight(
    [
      scenario(),
      scenario({
        scenarioId: "scn_2",
        criterionRef: "ac_2",
        recentResults: [{ status: "passed" }, { status: "failed" }, { status: "passed" }],
      }),
    ],
    3,
  );
  assert.equal(v.verdict, "not_green");
  assert.equal(v.flakeCount, 1);
});

test("a missing artifact on the latest run keeps it un-satisfied even with clean runs", () => {
  const v = evaluateGreenLight([scenario({ hasCompleteArtifacts: false })], 3);
  assert.equal(v.verdict, "not_green");
  assert.equal(v.artifactsComplete, false);
  assert.match(v.reason ?? "", /artifacts incomplete/);
});

test("fewer than requiredRuns stored results is not clean", () => {
  const v = evaluateGreenLight([scenario({ recentResults: [{ status: "passed" }, { status: "passed" }] })], 3);
  assert.equal(v.verdict, "not_green");
  assert.equal(v.cleanRuns, 2);
});

test("quarantining a linked scenario removes it from the requirement, not blocking forever", () => {
  const v = evaluateGreenLight(
    [
      scenario(),
      scenario({
        scenarioId: "scn_flaky",
        criterionRef: "ac_2",
        quarantined: true,
        recentResults: [{ status: "failed" }],
      }),
    ],
    3,
  );
  assert.equal(v.verdict, "green");
  assert.equal(v.counted.length, 1);
});

test("pending/authoring scaffolds don't count toward or block the requirement", () => {
  const v = evaluateGreenLight(
    [scenario(), scenario({ scenarioId: "scn_scaffold", criterionRef: "ac_2", state: "pending", recentResults: [] })],
    3,
  );
  assert.equal(v.verdict, "green");
  assert.equal(v.counted.length, 1);
});

test("no counted scenarios yet is not_green with a clear reason", () => {
  const v = evaluateGreenLight([scenario({ state: "pending" })], 3);
  assert.equal(v.verdict, "not_green");
  assert.match(v.reason ?? "", /no promoted/);
});
