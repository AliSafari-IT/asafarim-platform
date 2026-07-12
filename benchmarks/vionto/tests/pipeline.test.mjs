import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createJob, advance, retry } from "../engine/pipeline.mjs";
import { runEvents } from "../engine/replay.mjs";
import { FixtureProvider, LiveProviderStub } from "../engine/providers.mjs";
import { estimateCost } from "../engine/cost.mjs";
import { buildRenderReport } from "../engine/renderer.mjs";
import { validateStageOutput } from "../engine/manifest.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "..", "fixtures");

const briefs = JSON.parse(await readFile(join(FIXTURES, "briefs.json"), "utf8"));
const labels = JSON.parse(await readFile(join(FIXTURES, "labels.json"), "utf8"));

function briefById(id) {
  const b = briefs.find((x) => x.id === id);
  if (!b) throw new Error(`unknown brief ${id}`);
  return b;
}

test("determinism: replaying the same events on the same brief is byte-identical", () => {
  const brief = briefById("B-01");
  const a = runEvents(brief, ["start", "approve", "approve"], FixtureProvider);
  const b = runEvents(brief, ["start", "approve", "approve"], FixtureProvider);
  assert.equal(JSON.stringify(a.job), JSON.stringify(b.job));
});

test("labeled runs match the engine for every brief", () => {
  for (const [briefId, label] of Object.entries(labels)) {
    if (briefId.startsWith("_")) continue;
    const brief = briefById(briefId);
    const { job } = runEvents(brief, label.events, FixtureProvider);
    assert.equal(job.state, label.expectedState, `${briefId}: state mismatch`);
    assert.equal(job.retryCount, label.expectedRetryCount, `${briefId}: retryCount mismatch`);
  }
});

test("seeded schema failure (B-02) is caught by validation, not silently accepted", () => {
  const brief = briefById("B-02");
  const { history } = runEvents(brief, ["start", "approve"], FixtureProvider);
  const failedJob = history[history.length - 1];
  assert.equal(failedJob.state, "failed");
  assert.match(failedJob.errorSummary, /asset-plan failed schema validation/);
  assert.equal(failedJob.stage, "asset-plan");
});

test("approval gate blocks progression until approve() is called", () => {
  const brief = briefById("B-01");
  let job = createJob(brief);
  job = advance(job, "start", { brief, provider: FixtureProvider });
  assert.equal(job.state, "awaiting-approval");
  assert.equal(job.stage, "script");
  // The state machine has no "skip the gate" event; attempting to treat an
  // awaiting-approval job as if it were queued must fail loudly.
  assert.throws(() => advance(job, "start", { brief, provider: FixtureProvider }));
});

test("retry is only legal from failed or cancelled", () => {
  const brief = briefById("B-01");
  let job = createJob(brief);
  job = advance(job, "start", { brief, provider: FixtureProvider });
  assert.equal(job.state, "awaiting-approval");
  assert.throws(() => retry(job, { brief, provider: FixtureProvider }), /Cannot retry a job in state 'awaiting-approval'/);
});

test("retry never mutates the original job (idempotent, new job object)", () => {
  const brief = briefById("B-02");
  const { history } = runEvents(brief, ["start", "approve"], FixtureProvider);
  const failedJob = history[history.length - 1];
  const failedJobSnapshot = JSON.stringify(failedJob);

  const retried = retry(failedJob, { brief, provider: FixtureProvider });

  assert.equal(JSON.stringify(failedJob), failedJobSnapshot, "original job object was mutated");
  assert.notEqual(retried.id, failedJob.id);
  assert.equal(retried.retryCount, failedJob.retryCount + 1);
});

test("recovery from seeded stage failures: B-02 (schema) and B-03 (transient render) both reach succeeded", () => {
  for (const briefId of ["B-02", "B-03"]) {
    const brief = briefById(briefId);
    const { job } = runEvents(brief, labels[briefId].events, FixtureProvider);
    assert.equal(job.state, "succeeded", `${briefId} did not recover`);
  }
});

test("human rejection with no retry ends cleanly at cancelled (B-05)", () => {
  const brief = briefById("B-05");
  const { job } = runEvents(brief, ["start", "reject"], FixtureProvider);
  assert.equal(job.state, "cancelled");
});

test("every completed job's stage artifacts record configVersion and inputsHash", () => {
  const brief = briefById("B-01");
  const { job } = runEvents(brief, ["start", "approve", "approve"], FixtureProvider);
  for (const key of ["script", "storyboard", "assetPlan", "renderReport"]) {
    const artifact = job.artifacts[key];
    assert.ok(artifact, `missing artifact ${key}`);
    assert.ok(artifact.configVersion, `${key} missing configVersion`);
    assert.ok(artifact.inputsHash, `${key} missing inputsHash`);
  }
});

test("cost estimate is a pure function of the brief (same brief -> same estimate)", () => {
  const brief = briefById("B-01");
  const a = estimateCost(brief);
  const b = estimateCost(brief);
  assert.deepEqual(a, b);
  assert.ok(a.usdEst > 0);
});

test("render report totals equal the sum of its per-shot durations/frames", () => {
  const brief = briefById("B-01");
  const assetPlan = brief.fixtureAssetPlanByAttempt[0];
  const report = buildRenderReport(assetPlan);
  const sumDuration = report.shots.reduce((s, sh) => s + sh.durationSeconds, 0);
  const sumFrames = report.shots.reduce((s, sh) => s + sh.frameCount, 0);
  assert.equal(Math.round(sumDuration * 100) / 100, report.totalDurationSeconds);
  assert.equal(sumFrames, report.totalFrameCount);
});

test("schema validation rejects a manifest missing a required field", () => {
  const { valid, errors } = validateStageOutput("asset-plan", { assets: [{ shotIndex: 0, assetId: "x" }] });
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes("kind")));
});

test("LiveProviderStub is unreachable without an explicit confirmLive flag, and unreachable even with it", () => {
  assert.throws(() => LiveProviderStub.generateScript({}), /requires \{ confirmLive: true \}/);
  assert.throws(() => LiveProviderStub.generateScript({}, { confirmLive: true }), /not implemented/);
  assert.throws(() => LiveProviderStub.render({}, {}), /requires \{ confirmLive: true \}/);
  assert.throws(() => LiveProviderStub.render({}, { confirmLive: true }), /not implemented/);
});
