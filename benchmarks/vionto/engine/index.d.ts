/**
 * Hand-written types for the Vionto pipeline engine (engine/index.mjs). Kept
 * separate from the .mjs implementation so both the harness (Node) and the
 * Showcase demo (Next.js client component) get full typing without a build
 * step for this package.
 */

export type PipelineStage = "script" | "storyboard" | "asset-plan" | "render" | "done";
export type JobState = "queued" | "running" | "awaiting-approval" | "succeeded" | "failed" | "cancelled";
export type PipelineEvent = "start" | "approve" | "reject";

export interface Scene {
  description: string;
  narration: string;
}
export interface Script {
  title: string;
  scenes: Scene[];
}

export interface Shot {
  sceneIndex: number;
  shotType: "wide" | "medium" | "close-up";
  durationSeconds: number;
}
export interface Storyboard {
  shots: Shot[];
}

export interface PlannedAsset {
  shotIndex: number;
  assetId: string;
  kind: "placeholder-image" | "placeholder-clip";
}
export interface AssetPlan {
  assets: PlannedAsset[];
  /** Test-only seed flag: forces the render provider to fail on attempt 0. */
  __failsRenderOnFirstAttempt?: boolean;
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

export interface Brief {
  id: string;
  title: string;
  brief: string;
  /** Marks a brief that deliberately seeds a stage failure (schema-invalid or transient) for the benchmark's recovery dimension. */
  seedsFailure?: boolean;
  fixtureScriptByAttempt: Script[];
  fixtureStoryboardByAttempt: Storyboard[];
  fixtureAssetPlanByAttempt: AssetPlan[];
}

export interface StageArtifact<T> {
  value: T;
  configVersion: string;
  inputsHash: string;
  stage: PipelineStage;
}

export interface JobLogEntry {
  seq: number;
  event: string;
  detail: Record<string, unknown>;
}

export interface Job {
  id: string;
  briefId: string;
  state: JobState;
  stage: PipelineStage;
  retryCount: number;
  configVersion: string;
  artifacts: {
    script?: StageArtifact<Script>;
    storyboard?: StageArtifact<Storyboard>;
    assetPlan?: StageArtifact<AssetPlan>;
    renderReport?: StageArtifact<RenderReport>;
  };
  errorSummary: string | null;
  log: JobLogEntry[];
}

export interface ScriptProvider {
  generateScript(brief: Brief, opts?: { attempt: number }): { value: Script; tokensEst: number };
}
export interface RenderProvider {
  render(
    assetPlan: AssetPlan,
    opts: { attempt: number },
  ): { success: boolean; error?: string; secondsEst: number };
}
export interface FullProvider extends ScriptProvider, RenderProvider {
  generateStoryboard(script: Script, brief: Brief, opts?: { attempt: number }): { value: Storyboard };
  generateAssetPlan(storyboard: Storyboard, brief: Brief, opts?: { attempt: number }): { value: AssetPlan };
}

export declare const STATES: readonly JobState[];
export declare function createJob(brief: Brief): Job;
export declare function advance(
  job: Job,
  event: PipelineEvent,
  ctx: { brief: Brief; provider: FullProvider },
): Job;
export declare function retry(job: Job, ctx: { brief: Brief; provider: FullProvider }): Job;

export declare function runEvents(
  brief: Brief,
  events: Array<PipelineEvent | "retry">,
  provider: FullProvider,
): { job: Job; history: Job[] };

export declare const FixtureProvider: FullProvider;
export declare const LiveProviderStub: {
  generateScript(brief: Brief, opts?: { confirmLive?: boolean }): never;
  render(assetPlan: AssetPlan, opts?: { confirmLive?: boolean }): never;
};

export interface CostEstimate {
  scriptTokensEst: number;
  renderSecondsEst: number;
  usdEst: number;
}
export declare const REFERENCE_RATES: {
  usdPerScriptToken: number;
  usdPerRenderSecond: number;
  secondsPerShotEstimate: number;
};
export declare function estimateCost(brief: Brief): CostEstimate;

export declare function buildRenderReport(assetPlan: AssetPlan): RenderReport;
export declare function buildStoryboardSvg(report: RenderReport): string;

export declare function validateSchema(
  value: unknown,
  schema: Record<string, unknown>,
): { valid: boolean; errors: string[] };
export declare function validateStageOutput(
  stage: "script" | "storyboard" | "asset-plan",
  value: unknown,
): { valid: boolean; errors: string[] };
export declare function fingerprint(value: unknown): string;
export declare const CONFIG_VERSION: string;
