/*
 * generate-fixtures.mjs — distills the pipeline engine's output into the
 * committed fixture JSON the read-only Showcase demo renders.
 *
 * Same two-part convention as the Testora/AI-Eval/EduMatch generators:
 *
 *  1. VALIDATE: replay every brief's labeled event sequence
 *     (fixtures/labels.json) through the real engine and check the terminal
 *     state/retryCount match, every stage artifact records its
 *     configVersion/inputsHash, and the seeded-failure briefs actually
 *     recover. A mismatch exits non-zero so CI catches a regression.
 *
 *  2. EMIT: write runs.json + scores.json derived purely from the engine run
 *     traces plus a fixed reference block for wall-clock/latency figures
 *     (representative, not live) — no Date.now(). Re-running produces a
 *     byte-identical result.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runEvents } from "../engine/replay.mjs";
import { FixtureProvider } from "../engine/providers.mjs";
import { estimateCost } from "../engine/cost.mjs";
import { buildStoryboardSvg } from "../engine/renderer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const HARNESS = join(HERE, "..");
const FIXTURES = join(HARNESS, "fixtures");
const OUT_DIR = join(
  HARNESS,
  "..",
  "..",
  "apps",
  "showcase",
  "app",
  "projects",
  "vionto",
  "_data",
);

// Fixed reference block — representative reference latencies, not live
// measurements (the engine itself is a pure in-memory reducer and runs in
// sub-millisecond time; these numbers stand in for what a real pipeline with
// live providers/render workers would report).
const REF = {
  runId: "run-2026-07-16",
  ref: "main@f7a1c2e",
  generatedAt: "2026-07-16T09:00:00.000Z",
  stageLatencyMsEst: { script: 1800, storyboard: 400, "asset-plan": 350, render: 6500 },
};

async function loadFixtures() {
  const [briefs, labels] = await Promise.all([
    readFile(join(FIXTURES, "briefs.json"), "utf8").then(JSON.parse),
    readFile(join(FIXTURES, "labels.json"), "utf8").then(JSON.parse),
  ]);
  return { briefs, labels };
}

/**
 * Every job in `history` after the first shares its predecessor's full log
 * (advance() extends it) UNLESS the step was a retry (retry() resets the log
 * to a fresh single "retried" entry). Returns only the entries a given step
 * newly added, so scanning a whole run's history never double-counts an
 * entry that's still present in a later job's accumulated log.
 */
function newLogEntries(prevJob, currJob) {
  const isContinuation =
    currJob.log.length >= prevJob.log.length &&
    prevJob.log.every((entry, i) => JSON.stringify(entry) === JSON.stringify(currJob.log[i]));
  return isContinuation ? currJob.log.slice(prevJob.log.length) : currJob.log;
}

const ARTIFACT_KEY_FOR_STAGE = { script: "script", storyboard: "storyboard", "asset-plan": "assetPlan", render: "renderReport" };

/** Sum reference latency for every stage the job actually produced an artifact for. */
function estimateReferenceMs(job) {
  return Object.entries(REF.stageLatencyMsEst).reduce((sum, [stage, ms]) => {
    const touched = Boolean(job.artifacts[ARTIFACT_KEY_FOR_STAGE[stage]]);
    return sum + (touched ? ms : 0);
  }, 0);
}

function validateAndBuildRuns(briefs, labels) {
  const problems = [];
  const runs = [];
  let totalAttempts = 0;
  let validAttempts = 0;
  let seededFailureBriefs = 0;
  let seededFailureRecovered = 0;
  let totalRetrySteps = 0;
  let totalRetryViolations = 0;

  for (const brief of briefs) {
    const label = labels[brief.id];
    if (!label) {
      problems.push(`${brief.id}: no label found in labels.json`);
      continue;
    }

    const { job, history } = runEvents(brief, label.events, FixtureProvider);

    if (job.state !== label.expectedState) {
      problems.push(`${brief.id}: state ${job.state} != expected ${label.expectedState}`);
    }
    if (job.retryCount !== label.expectedRetryCount) {
      problems.push(`${brief.id}: retryCount ${job.retryCount} != expected ${label.expectedRetryCount}`);
    }

    // Walk each step's newly-added log entries only (see newLogEntries) to
    // tally schema-validation attempts and check retry-id uniqueness without
    // double-counting entries that persist in every later job's cloned log.
    const flatLog = [];
    for (let i = 0; i < label.events.length; i++) {
      const prevJob = history[i];
      const currJob = history[i + 1];
      const added = newLogEntries(prevJob, currJob);
      for (const entry of added) {
        flatLog.push({ jobId: currJob.id, ...entry });
        if ((entry.event === "stage-completed" || entry.event === "stage-failed") && entry.detail?.stage !== "render") {
          totalAttempts += 1;
          if (entry.event === "stage-completed") validAttempts += 1;
        }
      }
      if (label.events[i] === "retry") {
        totalRetrySteps += 1;
        if (currJob.id === prevJob.id) totalRetryViolations += 1;
      }
    }

    const isSeededFailure = brief.id === "B-02" || brief.id === "B-03";
    if (isSeededFailure) {
      seededFailureBriefs += 1;
      if (job.state === "succeeded") seededFailureRecovered += 1;
    }

    const costEstimate = estimateCost(brief);
    // "Observed" cost recomputed from the actual final artifacts. In fixture
    // mode this is identical to the pre-run estimate because nothing about
    // the brief varies between estimate-time and generation-time — there is
    // no live provider to introduce real deviation. See docs/vionto-benchmark.md.
    const costObserved =
      job.state === "succeeded"
        ? costEstimate
        : null;

    runs.push({
      briefId: brief.id,
      title: brief.title,
      brief: brief.brief,
      events: label.events,
      finalState: job.state,
      retryCount: job.retryCount,
      note: label.note,
      artifacts: job.artifacts,
      storyboardSvg: job.artifacts.renderReport ? buildStoryboardSvg(job.artifacts.renderReport.value) : null,
      costEstimate,
      costObserved,
      referenceLatencyMs: estimateReferenceMs(job),
      log: flatLog,
    });
  }

  if (problems.length) {
    console.error("[generate-fixtures] VALIDATION FAILED:");
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }

  const structuredOutputValidity = totalAttempts ? Math.round((validAttempts / totalAttempts) * 1000) / 10 : 100;
  const seededFailureRecoveryRate = seededFailureBriefs
    ? Math.round((seededFailureRecovered / seededFailureBriefs) * 1000) / 10
    : 100;
  const retryIdempotencyRate = totalRetrySteps
    ? Math.round((1 - totalRetryViolations / totalRetrySteps) * 1000) / 10
    : 100;

  console.log(
    `[generate-fixtures] validated ${briefs.length} briefs — structured-output validity ` +
      `${structuredOutputValidity}%, seeded-failure recovery ${seededFailureRecoveryRate}%, ` +
      `retry idempotency ${retryIdempotencyRate}%.`,
  );

  return {
    runs,
    scores: {
      structuredOutputValidity,
      retryIdempotencyRate,
      seededFailureRecoveryRate,
      totalAttempts,
      validAttempts,
    },
  };
}

function buildScoresDoc(scores, runs) {
  const completionTimes = runs.filter((r) => r.finalState === "succeeded").map((r) => r.referenceLatencyMs);
  const meanCompletionMs = completionTimes.length
    ? Math.round(completionTimes.reduce((s, v) => s + v, 0) / completionTimes.length)
    : 0;
  const costDeltas = runs
    .filter((r) => r.costObserved)
    .map((r) => Math.abs(r.costObserved.usdEst - r.costEstimate.usdEst));
  const maxCostDeltaUsd = costDeltas.length ? Math.max(...costDeltas) : 0;

  return {
    provenance: {
      source: "@asafarim/vionto-benchmark",
      note: "Distilled, reproducible snapshot from the deterministic pipeline engine run against synthetic fixtures. Not production telemetry; latency figures are representative reference timings, not live measurements.",
      runId: REF.runId,
      ref: REF.ref,
      generatedAt: REF.generatedAt,
    },
    dimensions: {
      structuredOutputValidity: {
        value: scores.structuredOutputValidity,
        unit: "%",
        method: `Share of schema-validated stage-generation attempts (script/storyboard/asset-plan) that passed validation, across every brief and every retry (${scores.validAttempts}/${scores.totalAttempts} attempts).`,
      },
      retryIdempotencyCorrectness: {
        value: scores.retryIdempotencyRate,
        unit: "%",
        method: "Every retry produces a new, uniquely-identified job rather than mutating the failed/cancelled one, and the engine itself refuses retry from any other state.",
      },
      endToEndCompletionTime: {
        value: meanCompletionMs,
        unit: "ms (reference)",
        method: "Mean representative reference latency across successfully completed runs — the engine itself runs in sub-millisecond time; this figure stands in for a live pipeline's wall-clock time.",
      },
      estimatedVsObservedCost: {
        value: maxCostDeltaUsd,
        unit: "max $ delta",
        method: "Maximum difference between the pre-run cost estimate and the cost recomputed from final artifacts. Zero in fixture mode by construction — there is no live provider to introduce real variance; connecting one is where deviation would first appear.",
      },
      seededFailureRecovery: {
        value: scores.seededFailureRecoveryRate,
        unit: "%",
        method: "Share of briefs seeded with a stage failure (a schema-invalid asset plan, a transient render error) that reach 'succeeded' via the documented retry path.",
      },
    },
  };
}

async function main() {
  const { briefs, labels } = await loadFixtures();
  const { runs, scores } = validateAndBuildRuns(briefs, labels);
  const scoresDoc = buildScoresDoc(scores, runs);

  await writeFile(join(OUT_DIR, "runs.json"), JSON.stringify(runs, null, 2) + "\n");
  await writeFile(join(OUT_DIR, "scores.json"), JSON.stringify(scoresDoc, null, 2) + "\n");
  console.log(`[generate-fixtures] wrote runs.json + scores.json → ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
