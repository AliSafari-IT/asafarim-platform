/**
 * Types for the Vionto Studio benchmark fixtures. Mirror what
 * `benchmarks/vionto/scripts/generate-fixtures.mjs` emits into this folder
 * (runs.json, scores.json), plus the pipeline/job shapes re-declared from
 * `benchmarks/vionto/engine/index.d.ts` so JSON consumers don't need a
 * cross-package type import.
 *
 * The demo consumes these read-only — there is no pipeline execution here,
 * no network. The interactive Pipeline Explorer runs the real engine
 * client-side against the same committed fixtures (see _components/PipelineExplorer.tsx).
 */

export type JobState = "queued" | "running" | "awaiting-approval" | "succeeded" | "failed" | "cancelled";
export type PipelineStage = "script" | "storyboard" | "asset-plan" | "render" | "done";

export interface StageArtifact<T = unknown> {
  value: T;
  configVersion: string;
  inputsHash: string;
  stage: PipelineStage;
}

export interface RunLogEntry {
  jobId: string;
  seq: number;
  event: string;
  detail: Record<string, unknown>;
}

export interface CostEstimate {
  scriptTokensEst: number;
  renderSecondsEst: number;
  usdEst: number;
}

export interface RenderShotReport {
  shotIndex: number;
  assetId: string;
  kind: string;
  durationSeconds: number;
  frameCount: number;
}
export interface RenderReport {
  fps: number;
  shots: RenderShotReport[];
  totalDurationSeconds: number;
  totalFrameCount: number;
}

export interface RunEntry {
  briefId: string;
  title: string;
  brief: string;
  events: string[];
  finalState: JobState;
  retryCount: number;
  note: string;
  artifacts: {
    script?: StageArtifact;
    storyboard?: StageArtifact;
    assetPlan?: StageArtifact;
    renderReport?: StageArtifact<RenderReport>;
  };
  storyboardSvg: string | null;
  costEstimate: CostEstimate;
  costObserved: CostEstimate | null;
  referenceLatencyMs: number;
  log: RunLogEntry[];
}

export interface BenchmarkDimensionScore {
  value: number;
  unit: string;
  method: string;
}

export interface BenchmarkScores {
  provenance: {
    source: string;
    note: string;
    runId: string;
    ref: string;
    generatedAt: string;
  };
  dimensions: {
    structuredOutputValidity: BenchmarkDimensionScore;
    retryIdempotencyCorrectness: BenchmarkDimensionScore;
    endToEndCompletionTime: BenchmarkDimensionScore;
    estimatedVsObservedCost: BenchmarkDimensionScore;
    seededFailureRecovery: BenchmarkDimensionScore;
  };
}

/** One of the five benchmark dimensions presented in the demo's overview. */
export interface BenchmarkDimension {
  key: keyof BenchmarkScores["dimensions"];
  name: string;
  question: string;
}
