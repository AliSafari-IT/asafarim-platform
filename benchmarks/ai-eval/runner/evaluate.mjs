/*
 * The evaluation core, shared by the CLI runner and the fixture generator.
 * Fixture mode only: every "model response" is a checked-in JSON fixture, so
 * the whole suite runs offline, deterministically, with no API keys.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  scoreCorrectness,
  scoreFormat,
  scoreGroundedness,
  scoreSafety,
} from "../scoring/scorers.mjs";
import { caseCostUsd } from "../providers/catalog.mjs";
import { ACTIVE_VERSION } from "../prompts/prompts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const SCENARIOS = ["extraction", "grounded-qa", "tool-selection"];
const MODEL_IDS = ["frontier-a", "balanced-b", "compact-c"];

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

export function loadDatasets() {
  return SCENARIOS.map((s) => readJson(join(ROOT, "datasets", `${s}.json`)));
}

export function loadFixtures() {
  const out = {};
  for (const id of MODEL_IDS) {
    out[id] = readJson(join(ROOT, "providers", "fixtures", `${id}.json`)).responses;
  }
  return out;
}

const round = (n, d = 3) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

/** Score one model's response to one case. */
function scoreCase(dataset, testCase, modelId, response) {
  const scenario = dataset.scenario;
  const output = response.output;
  const scores = {
    correctness: round(scoreCorrectness(scenario, output, testCase.expected)),
    format: round(scoreFormat(scenario, output, dataset)),
    groundedness: scenario === "grounded-qa"
      ? round(scoreGroundedness(output, testCase.expected))
      : null,
    safety: testCase.safetyProbe
      ? round(scoreSafety(scenario, output, testCase.expected))
      : null,
  };
  const costUsd = caseCostUsd(modelId, response.tokensIn, response.tokensOut);
  return {
    modelId,
    scenario,
    caseId: testCase.id,
    safetyProbe: Boolean(testCase.safetyProbe),
    output,
    expected: testCase.expected,
    scores,
    latencyMs: response.latencyMs,
    tokensIn: response.tokensIn,
    tokensOut: response.tokensOut,
    costUsd: round(costUsd, 6),
  };
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Run the full matrix (all models × all cases) at a prompt version. */
export function evaluateAll(version = ACTIVE_VERSION) {
  const datasets = loadDatasets();
  const fixtures = loadFixtures();
  const results = [];

  for (const dataset of datasets) {
    for (const testCase of dataset.cases) {
      for (const modelId of MODEL_IDS) {
        const key = `${dataset.scenario}:${testCase.id}:${version}`;
        const response = fixtures[modelId][key];
        if (!response) throw new Error(`Missing fixture: ${modelId} ${key}`);
        results.push(scoreCase(dataset, testCase, modelId, response));
      }
    }
  }

  // Per-model aggregates.
  const byModel = {};
  for (const modelId of MODEL_IDS) {
    const rows = results.filter((r) => r.modelId === modelId);
    const correctness = round(mean(rows.map((r) => r.scores.correctness)));
    const format = round(mean(rows.map((r) => r.scores.format)));
    const groundedness = round(
      mean(rows.filter((r) => r.scores.groundedness != null).map((r) => r.scores.groundedness)),
    );
    const safety = round(
      mean(rows.filter((r) => r.scores.safety != null).map((r) => r.scores.safety)),
    );
    const overall = round(mean([correctness, groundedness, format, safety]));
    byModel[modelId] = {
      correctness,
      groundedness,
      format,
      safety,
      overall,
      meanLatencyMs: Math.round(mean(rows.map((r) => r.latencyMs))),
      meanCostUsd: round(mean(rows.map((r) => r.costUsd)), 6),
      cases: rows.length,
    };
  }

  return { version, results, byModel, scenarios: datasets };
}

/**
 * The documented failed regression: compact-c on tool-selection, prompt v1→v2.
 * The stricter v2 prompt breaks format compliance on tool-1 (an enum-invalid
 * unit), dropping that case from pass to fail.
 */
export function evaluateRegression() {
  const datasets = loadDatasets();
  const fixtures = loadFixtures();
  const dataset = datasets.find((d) => d.scenario === "tool-selection");
  const modelId = "compact-c";
  const rows = dataset.cases.map((testCase) => {
    const v1 = scoreCase(dataset, testCase, modelId, fixtures[modelId][`tool-selection:${testCase.id}:v1`]);
    const v2 = scoreCase(dataset, testCase, modelId, fixtures[modelId][`tool-selection:${testCase.id}:v2`]);
    const regressed =
      v2.scores.correctness < v1.scores.correctness || v2.scores.format < v1.scores.format;
    return { caseId: testCase.id, v1, v2, regressed };
  });
  return { modelId, scenario: "tool-selection", rows };
}

export { MODEL_IDS, SCENARIOS };
