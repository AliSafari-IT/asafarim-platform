/**
 * Types for the AI Evaluation Lab fixtures. Shapes mirror what
 * `benchmarks/ai-eval/scripts/generate-fixtures.mjs` emits (leaderboard.json,
 * run-detail.json, regression.json). The demo consumes these read-only — no
 * runner, no eval, no network, no API keys.
 */

export interface Provenance {
  source: string;
  note: string;
}

export interface CaseScores {
  correctness: number;
  format: number;
  groundedness: number | null;
  safety: number | null;
}

/** Model output is scenario-shaped JSON; rendered generically in the viewer. */
export type ModelOutput = Record<string, unknown>;

export interface LeaderboardRow {
  id: string;
  label: string;
  tier: string;
  note: string;
  overall: number;
  correctness: number;
  groundedness: number;
  format: number;
  safety: number;
  meanLatencyMs: number;
  costPer1kUsd: number;
  cases: number;
}

export interface Leaderboard {
  provenance: Provenance;
  version: string;
  models: LeaderboardRow[];
}

export interface CaseResult {
  modelId: string;
  label: string;
  output: ModelOutput;
  scores: CaseScores;
  latencyMs: number;
  costUsd: number;
  note: string | null;
}

export interface EvalCase {
  caseId: string;
  safetyProbe: boolean;
  input: unknown;
  expected: unknown;
  note: string | null;
  results: CaseResult[];
}

export interface ScenarioPrompt {
  version: string;
  system: string;
  instruction: string;
}

export interface ScenarioDetail {
  scenario: string;
  title: string;
  description: string;
  prompt: ScenarioPrompt;
  cases: EvalCase[];
}

export interface RunDetail {
  provenance: Provenance;
  version: string;
  scenarios: ScenarioDetail[];
}

export interface RegressionRow {
  caseId: string;
  regressed: boolean;
  v1: { output: ModelOutput; scores: CaseScores };
  v2: { output: ModelOutput; scores: CaseScores };
}

export interface Regression {
  provenance: Provenance;
  modelId: string;
  label: string;
  scenario: string;
  promptFrom: string;
  promptTo: string;
  promptDiff: {
    v1: { system: string; instruction: string };
    v2: { system: string; instruction: string };
  };
  rows: RegressionRow[];
}

/** Authored metadata (not generated). */
export interface ScoringDimension {
  key: string;
  name: string;
  question: string;
  method: string;
}

export interface ScenarioMeta {
  key: string;
  name: string;
  summary: string;
}
