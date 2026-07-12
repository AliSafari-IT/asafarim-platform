/*
 * The pipeline state machine — the genuinely new domain insight this
 * benchmark ports from the legacy Vionto render-job model (Prisma
 * `ViontoRenderJob.state` + the idempotent retry route at
 * app/api/render/[jobId]/retry/route.ts), generalized beyond rendering to
 * every pipeline stage.
 *
 * Pure and deterministic: `advance(job, event, ctx)` and `retry(job, ctx)`
 * both return a NEW job object and never mutate their input, so a run is
 * fully replayable and trivially testable. `ctx = { brief, provider }` is
 * where the (fixture-only) generation and rendering calls live.
 *
 * Stages: script -> storyboard -> asset-plan -> render -> done, with human
 * approval gates before storyboard (after script) and before render (after
 * asset-plan). A job can only be retried from `failed` or `cancelled` — the
 * same idempotency rule the legacy retry route enforced — and retrying
 * creates a new job id with retryCount+1 rather than mutating history.
 */
import { validateStageOutput, fingerprint, CONFIG_VERSION } from "./manifest.mjs";
import { buildRenderReport } from "./renderer.mjs";

export const STATES = Object.freeze([
  "queued",
  "running",
  "awaiting-approval",
  "succeeded",
  "failed",
  "cancelled",
]);

function cloneJob(job) {
  return { ...job, artifacts: { ...job.artifacts }, log: [...job.log] };
}

function appendLog(job, event, detail) {
  return { ...job, log: [...job.log, { seq: job.log.length, event, detail }] };
}

/** A fresh, unstarted job for a brief. */
export function createJob(brief) {
  return {
    id: `job-${brief.id}-0`,
    briefId: brief.id,
    state: "queued",
    stage: "script",
    retryCount: 0,
    configVersion: CONFIG_VERSION,
    artifacts: {},
    errorSummary: null,
    log: [],
  };
}

function artifactKeyFor(stage) {
  return stage === "asset-plan" ? "assetPlan" : stage;
}

/** Runs one generation stage's provider call + schema validation. */
function runStage(job, brief, provider, stage) {
  const opts = { attempt: job.retryCount };
  let output;
  if (stage === "script") output = provider.generateScript(brief, opts).value;
  else if (stage === "storyboard") output = provider.generateStoryboard(job.artifacts.script.value, brief, opts).value;
  else if (stage === "asset-plan") output = provider.generateAssetPlan(job.artifacts.storyboard.value, brief, opts).value;
  else throw new Error(`runStage: unknown generation stage '${stage}'`);

  const { valid, errors } = validateStageOutput(stage, output);
  if (!valid) {
    let next = cloneJob(job);
    next.state = "failed";
    next.errorSummary = `${stage} failed schema validation: ${errors.join("; ")}`;
    return appendLog(next, "stage-failed", { stage, errors });
  }

  let next = cloneJob(job);
  next.artifacts = {
    ...next.artifacts,
    [artifactKeyFor(stage)]: {
      value: output,
      configVersion: CONFIG_VERSION,
      inputsHash: fingerprint({ stage, briefId: brief.id, retryCount: job.retryCount }),
      stage,
    },
  };
  return appendLog(next, "stage-completed", { stage });
}

/** Attempts the render stage (provider call + report), given the asset plan is already valid. */
function runRenderAttempt(job, brief, provider) {
  let next = cloneJob(job);
  const assetPlan = next.artifacts.assetPlan.value;
  const result = provider.render(assetPlan, { attempt: next.retryCount });
  if (!result.success) {
    next.state = "failed";
    next.errorSummary = result.error;
    return appendLog(next, "stage-failed", { stage: "render", error: result.error });
  }
  const report = buildRenderReport(assetPlan);
  next.artifacts.renderReport = {
    value: report,
    configVersion: CONFIG_VERSION,
    inputsHash: fingerprint({ stage: "render", briefId: brief.id, retryCount: next.retryCount }),
    stage: "render",
  };
  next.stage = "done";
  next.state = "succeeded";
  return appendLog(next, "run-succeeded", { secondsObserved: report.totalDurationSeconds });
}

/**
 * Advance a job by one explicit event: "start" | "approve" | "reject".
 * Throws on an event that is illegal from the job's current state — the
 * approval gate cannot be skipped.
 */
export function advance(job, event, ctx) {
  const { brief, provider } = ctx;

  if (event === "start") {
    if (job.state !== "queued") throw new Error(`Cannot start from state '${job.state}'`);
    let next = appendLog({ ...cloneJob(job), state: "running" }, "run-started", { stage: job.stage });
    next = runStage(next, brief, provider, "script");
    if (next.state === "failed") return next;
    next.state = "awaiting-approval";
    return appendLog(next, "awaiting-approval", { gate: "script" });
  }

  if (event === "approve") {
    if (job.state !== "awaiting-approval") throw new Error(`Cannot approve from state '${job.state}'`);

    if (job.stage === "script") {
      let next = appendLog(
        { ...cloneJob(job), state: "running", stage: "storyboard" },
        "approved",
        { gate: "script" },
      );
      next = runStage(next, brief, provider, "storyboard");
      if (next.state === "failed") return next;
      next.stage = "asset-plan";
      next = runStage(next, brief, provider, "asset-plan");
      if (next.state === "failed") return next;
      next.state = "awaiting-approval";
      return appendLog(next, "awaiting-approval", { gate: "render" });
    }

    if (job.stage === "asset-plan") {
      let next = appendLog(
        { ...cloneJob(job), state: "running", stage: "render" },
        "approved",
        { gate: "render" },
      );
      return runRenderAttempt(next, brief, provider);
    }

    throw new Error(`No approval gate at stage '${job.stage}'`);
  }

  if (event === "reject") {
    if (job.state !== "awaiting-approval") throw new Error(`Cannot reject from state '${job.state}'`);
    const gate = job.stage === "script" ? "script" : "render";
    return appendLog({ ...cloneJob(job), state: "cancelled" }, "rejected", { gate });
  }

  throw new Error(`Unknown event '${event}'`);
}

/**
 * Idempotent retry — legal ONLY from `failed` or `cancelled` (mirrors the
 * legacy retry route's `state !== "failed" && state !== "cancelled"` guard).
 * Returns a brand-new job (new id, retryCount+1) that resumes at the stage
 * that failed/was rejected; the original job object is untouched, so history
 * is never mutated.
 */
export function retry(job, ctx) {
  if (job.state !== "failed" && job.state !== "cancelled") {
    throw new Error(`Cannot retry a job in state '${job.state}'`);
  }
  const { brief, provider } = ctx;
  const retryCount = job.retryCount + 1;

  let next = {
    id: `job-${brief.id}-${retryCount}`,
    briefId: job.briefId,
    state: "running",
    stage: job.stage,
    retryCount,
    configVersion: job.configVersion,
    artifacts: { ...job.artifacts },
    errorSummary: null,
    log: [{ seq: 0, event: "retried", detail: { fromJobId: job.id, stage: job.stage } }],
  };
  delete next.artifacts[artifactKeyFor(next.stage)];

  if (next.stage === "render") {
    return runRenderAttempt(next, brief, provider);
  }

  next = runStage(next, brief, provider, next.stage);
  if (next.state === "failed") return next;

  if (next.stage === "script") {
    next.state = "awaiting-approval";
    return appendLog(next, "awaiting-approval", { gate: "script" });
  }

  // Retrying a rejected/failed asset-plan stage: proceed straight to the render gate.
  next.state = "awaiting-approval";
  return appendLog(next, "awaiting-approval", { gate: "render" });
}
