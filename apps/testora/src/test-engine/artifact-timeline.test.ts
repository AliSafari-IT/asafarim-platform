import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ARTIFACT_RETENTION_DAYS,
  artifactExpiry,
  artifactStorageKey,
  buildStepTimeline,
} from "./artifact-timeline";

test("artifactStorageKey is deterministic per result + kind", () => {
  assert.equal(
    artifactStorageKey("res_1", "screenshot"),
    "testora/results/res_1/screenshot.png",
  );
  assert.equal(
    artifactStorageKey("res_1", "domSnapshot"),
    "testora/results/res_1/domSnapshot.html",
  );
  assert.equal(artifactStorageKey("res_1", "video"), "testora/results/res_1/video.mp4");
});

test("artifactExpiry stamps capturedAt + expiresAt one retention window apart", () => {
  const from = new Date("2026-09-10T00:00:00.000Z");
  const { capturedAt, expiresAt } = artifactExpiry(from);
  assert.equal(capturedAt, "2026-09-10T00:00:00.000Z");
  const days = (Date.parse(expiresAt) - Date.parse(capturedAt)) / 86_400_000;
  assert.equal(days, ARTIFACT_RETENTION_DAYS);
});

test("buildStepTimeline marks the failing step and skips the rest", () => {
  const steps = buildStepTimeline({
    apiFnChain: ["navigateTo('/login')", "typeText('#email', ...)", "click('#submit')", "expect(...).ok()"],
    apiFnIndex: 2,
  });
  assert.deepEqual(
    steps.map((s) => s.status),
    ["passed", "passed", "failed", "skipped"],
  );
  assert.equal(steps[2]?.label, "click('#submit')");
  assert.equal(steps[0]?.startedAtMs, 0);
});

test("buildStepTimeline returns [] when there is no chain", () => {
  assert.deepEqual(buildStepTimeline(null), []);
  assert.deepEqual(buildStepTimeline({}), []);
  assert.deepEqual(buildStepTimeline({ apiFnChain: [] }), []);
});

test("buildStepTimeline clamps an out-of-range failing index to the last step", () => {
  const steps = buildStepTimeline({ apiFnChain: ["a", "b"], apiFnIndex: 99 });
  assert.deepEqual(
    steps.map((s) => s.status),
    ["passed", "failed"],
  );
});
