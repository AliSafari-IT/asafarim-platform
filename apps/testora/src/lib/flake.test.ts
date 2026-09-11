import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computePassRate,
  hasFailThenPass,
  isFlaky,
  shouldAutoQuarantine,
} from "./flake";

test("hasFailThenPass detects a fail followed by a later pass, ordered by runIndex", () => {
  assert.equal(
    hasFailThenPass([
      { runIndex: 0, status: "failed" },
      { runIndex: 1, status: "passed" },
    ]),
    true,
  );
  // Out-of-order input is still sorted by runIndex first.
  assert.equal(
    hasFailThenPass([
      { runIndex: 1, status: "passed" },
      { runIndex: 0, status: "failed" },
    ]),
    true,
  );
});

test("hasFailThenPass is false for all-pass, all-fail, or pass-then-fail", () => {
  assert.equal(hasFailThenPass([{ runIndex: 0, status: "passed" }, { runIndex: 1, status: "passed" }]), false);
  assert.equal(hasFailThenPass([{ runIndex: 0, status: "failed" }, { runIndex: 1, status: "failed" }]), false);
  assert.equal(hasFailThenPass([{ runIndex: 0, status: "passed" }, { runIndex: 1, status: "failed" }]), false);
  assert.equal(hasFailThenPass([{ runIndex: null, status: "passed" }]), false);
});

test("computePassRate ignores non-terminal statuses and reports sample size", () => {
  const r = computePassRate(["passed", "failed", "pending", "running", "passed"]);
  assert.equal(r.sampleSize, 3);
  assert.equal(r.passRate, 2 / 3);
});

test("computePassRate returns null with no terminal sample", () => {
  assert.deepEqual(computePassRate(["pending", "running"]), { passRate: null, sampleSize: 0 });
});

test("isFlaky: a fail-then-pass run is always flaky regardless of history", () => {
  assert.equal(isFlaky(null, 0, true), true);
  assert.equal(isFlaky(1, 1, true), true);
});

test("isFlaky: a strictly-between pass rate over >=2 samples is flaky", () => {
  assert.equal(isFlaky(0.5, 4, false), true);
  assert.equal(isFlaky(0, 4, false), false);
  assert.equal(isFlaky(1, 4, false), false);
});

test("isFlaky: a single-sample rate of 0 or 1 is not flaky", () => {
  assert.equal(isFlaky(1, 1, false), false);
  assert.equal(isFlaky(0, 1, false), false);
});

test("shouldAutoQuarantine requires opt-in, a flaky verdict, no prior quarantine, and a minimum sample", () => {
  const base = { autoQuarantineEnabled: true, alreadyQuarantined: false, flaky: true, sampleSize: 3 };
  assert.equal(shouldAutoQuarantine(base), true);
  assert.equal(shouldAutoQuarantine({ ...base, autoQuarantineEnabled: false }), false);
  assert.equal(shouldAutoQuarantine({ ...base, alreadyQuarantined: true }), false);
  assert.equal(shouldAutoQuarantine({ ...base, flaky: false }), false);
  assert.equal(shouldAutoQuarantine({ ...base, sampleSize: 2 }), false);
});
