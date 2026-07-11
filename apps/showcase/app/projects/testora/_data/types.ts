/**
 * Types for the Testora benchmark fixtures. The shapes mirror what
 * `benchmarks/testora/scripts/generate-fixtures.mjs` emits into this folder
 * (run-detail.json, runs.json). Ported/condensed from the concept models in
 * the reference rewrite (e2e-testora `src/test-engine/types.ts`,
 * `src/lib/report.ts`).
 *
 * The demo consumes these read-only — there is no runner, no eval, no network.
 */

export type CaseStatus = "passed" | "failed" | "flaky";
export type ScenarioKind = "pass" | "fail" | "flaky";

export interface CaseArtifacts {
  trace: boolean;
  screenshot: boolean;
  video: boolean;
  log: boolean;
}

export interface BenchmarkCase {
  id: string;
  suite: string;
  title: string;
  status: CaseStatus;
  kind: ScenarioKind;
  dimension: string;
  durationMs: number;
  defect: string | null;
  diagnosis: string | null;
  cluster: string | null;
  artifacts: CaseArtifacts;
}

export interface SuiteGroup {
  suite: string;
  cases: BenchmarkCase[];
}

export interface FailureCluster {
  key: string;
  title: string;
  hint: string;
  caseIds: string[];
  kind: "failure" | "flaky";
  diagnosis: string | null;
}

export interface RunTimelineItem {
  time: string;
  title: string;
  meta?: string;
}

export interface RunSummary {
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  passRate: number;
}

export interface RunScores {
  detectionRate: number;
  seededRegressions: number;
  regressionsDetected: number;
  flakyIdentified: boolean;
  meanTimeToDiagnosisMs: number;
  artifactCompleteness: number;
  ciReproducibility: number;
}

export interface Provenance {
  source: string;
  note: string;
  generatedFrom?: string;
}

export interface RunDetail {
  provenance: Provenance;
  runId: string;
  ref: string;
  startedAt: string;
  durationMs: number;
  summary: RunSummary;
  scores: RunScores;
  suites: SuiteGroup[];
  clusters: FailureCluster[];
  timeline: RunTimelineItem[];
}

export interface TrendRun {
  runId: string;
  ref: string;
  at: string;
  passRate: number;
  detectionRate: number;
  flakyIdentified: boolean;
  durationMs: number | null;
}

export interface RunsHistory {
  provenance: Pick<Provenance, "source" | "note">;
  runs: TrendRun[];
}

/** One of the five benchmark dimensions presented in the demo. */
export interface BenchmarkDimension {
  key: string;
  name: string;
  question: string;
  /** How this dimension is measured against the seeded fixtures. */
  method: string;
}
