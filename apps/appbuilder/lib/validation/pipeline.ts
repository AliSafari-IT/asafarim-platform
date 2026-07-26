import { and, eq } from "drizzle-orm";
import type { ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import type { Db } from "../db/client";
import { apps, previewBuilds, specificationVersions, validationArtifacts, validationRuns } from "../db/schema";
import type { Actor } from "../auth/actor";
import { requestPreviewBuild } from "../repositories/previewService";
import { recordAuditEvent } from "../repositories/audit";
import {
  heartbeat,
  releaseLease,
  transitionStatus,
  finalizeRun,
  upsertGateResult,
  isCancellationRequested,
  ValidationRunLeaseLostError,
  type ValidationRunRow,
} from "../repositories/validationRuns";
import { GATE_DEFINITIONS } from "./gates/registry";
import { VALIDATION_LIMITS } from "./limits";
import { redactDiagnostics } from "./redaction";
import type { GateContext, GateResult } from "./types";

export interface ValidationPipelineDeps {
  db: Db;
  workerId: string;
  leaseDurationMs: number;
  signal: AbortSignal;
}

export type ValidationPipelineOutcome =
  | { kind: "completed"; run: ValidationRunRow }
  | { kind: "lease_lost" };

class GateTimeoutError extends Error {
  constructor() {
    super("Gate exceeded its execution time budget.");
    this.name = "GateTimeoutError";
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new GateTimeoutError()), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function reloadRun(db: Db, runId: string): Promise<ValidationRunRow | null> {
  const [row] = await db.select().from(validationRuns).where(eq(validationRuns.id, runId)).limit(1);
  return row ?? null;
}

/**
 * Drives one validation run from `pending`/`running` through to a terminal
 * status — the durable worker job M10's issue requires ("run validation in
 * a durable worker job; do not run full QA inside HTTP requests"). Executes
 * EVERY gate in `GATE_DEFINITIONS`, in order, unconditionally — a gate
 * failing never skips subsequent gates, so a single run always produces a
 * complete picture rather than stopping at the first problem. Cooperative
 * cancellation is checked before each gate; an in-flight gate is not
 * forcibly interrupted mid-execution beyond its own timeout budget (browser
 * automation inside a gate is itself responsible for honoring `ctx.signal`
 * where practical).
 */
export async function runValidationRun(deps: ValidationPipelineDeps, initialRun: ValidationRunRow): Promise<ValidationPipelineOutcome> {
  let run = initialRun;

  if (deps.signal.aborted || isCancellationRequested(run)) {
    run = await transitionStatus(deps.db, run.id, run.status as "pending" | "running", "cancelled");
    return { kind: "completed", run };
  }

  try {
    await heartbeat(deps.db, run.id, deps.workerId, deps.leaseDurationMs);
  } catch (err) {
    if (err instanceof ValidationRunLeaseLostError) return { kind: "lease_lost" };
    throw err;
  }

  if (run.status === "pending") {
    run = await transitionStatus(deps.db, run.id, "pending", "running");
    await recordAuditEvent(deps.db, {
      appId: run.appId,
      actorPrincipalId: run.requestedByPrincipalId,
      action: "validation.started",
      targetType: "validation_run",
      targetId: run.id,
      metadata: { gateCount: GATE_DEFINITIONS.length },
    });
  }

  const [appRow] = await deps.db.select().from(apps).where(eq(apps.id, run.appId)).limit(1);
  if (!appRow) throw new Error(`App ${run.appId} not found while running validation run ${run.id}`);
  const ownerActor: Actor = { principalId: appRow.ownerPrincipalId, roles: [] };

  const [specVersion] = await deps.db.select().from(specificationVersions).where(eq(specificationVersions.id, run.specificationVersionId)).limit(1);
  if (!specVersion) throw new Error(`Specification version ${run.specificationVersionId} not found while running validation run ${run.id}`);
  const specPayload = specVersion.payload as unknown as ApplicationSpecificationType;

  // Step 5: build a controlled test environment for the pinned preview —
  // only if one doesn't already exist for this EXACT pinned version, and
  // only if the app hasn't moved on to a newer version since this run was
  // created (never silently re-pin to a different version's preview).
  let previewBuild = run.previewBuildId ? (await deps.db.select().from(previewBuilds).where(eq(previewBuilds.id, run.previewBuildId)).limit(1))[0] ?? null : null;
  if (!previewBuild) {
    const [currentSpec] = await deps.db.select({ currentVersionNumber: specificationVersions.versionNumber }).from(specificationVersions).where(eq(specificationVersions.id, run.specificationVersionId)).limit(1);
    if (currentSpec) {
      const { build } = await requestPreviewBuild(deps.db, ownerActor, run.appId).catch(() => ({ build: null as never }));
      if (build && build.specificationVersionId === run.specificationVersionId) {
        previewBuild = build;
        await deps.db.update(validationRuns).set({ previewBuildId: build.id, previewChecksum: build.checksum, updatedAt: new Date() }).where(eq(validationRuns.id, run.id));
      }
      // If the build's version doesn't match (the app moved on since this
      // run was created), previewBuild stays null — preview-dependent gates
      // fail closed rather than validating the wrong version under this
      // run's identity.
    }
  }

  let anyInfrastructureError = false;
  let anyFlaky = false;
  let anyFailed = false;

  for (const gate of GATE_DEFINITIONS) {
    const fresh = await reloadRun(deps.db, run.id);
    if (!fresh) return { kind: "lease_lost" };
    run = fresh;
    if (deps.signal.aborted || isCancellationRequested(run)) {
      run = await transitionStatus(deps.db, run.id, "running", "cancelled");
      return { kind: "completed", run };
    }

    try {
      await heartbeat(deps.db, run.id, deps.workerId, deps.leaseDurationMs);
    } catch (err) {
      if (err instanceof ValidationRunLeaseLostError) return { kind: "lease_lost" };
      throw err;
    }

    const ctx: GateContext = {
      db: deps.db,
      appId: run.appId,
      runId: run.id,
      specPayload,
      specVersionId: run.specificationVersionId,
      specVersionNumber: specVersion.versionNumber,
      specChecksum: run.specificationChecksum,
      previewBuild,
      registryVersion: run.registryVersion,
      ownerPrincipalId: appRow.ownerPrincipalId,
      signal: deps.signal,
    };

    const startedAt = new Date();
    let result: GateResult;
    try {
      result = await withTimeout(gate.execute(ctx), VALIDATION_LIMITS.GATE_TIMEOUT_MS);
    } catch (err) {
      const message = err instanceof GateTimeoutError ? err.message : "The gate threw an unexpected error.";
      result = {
        status: "infrastructure_error",
        failureCode: err instanceof GateTimeoutError ? "gate_timeout" : "gate_threw",
        failureMessage: message,
        evidence: redactDiagnostics({ error: err instanceof Error ? err.message : String(err) }),
      };
    }
    const completedAt = new Date();

    const artifactRows = await deps.db
      .select({ id: validationArtifacts.id })
      .from(validationArtifacts)
      .where(and(eq(validationArtifacts.runId, run.id), eq(validationArtifacts.gateKey, gate.key)));

    await upsertGateResult(deps.db, {
      runId: run.id,
      appId: run.appId,
      gateKey: gate.key,
      gateVersion: gate.version,
      mandatory: result.mandatoryOverride ?? gate.mandatory,
      result,
      startedAt,
      completedAt,
      artifactIds: artifactRows.map((r) => r.id),
    });

    if (result.status === "infrastructure_error") anyInfrastructureError = true;
    else if (result.status === "flaky") anyFlaky = true;
    else if (result.status === "failed") anyFailed = true;
  }

  const finalStatus = anyInfrastructureError ? "infrastructure_error" : anyFlaky ? "flaky" : anyFailed ? "failed" : "passed";
  run = await finalizeRun(deps.db, run.id, finalStatus);

  await recordAuditEvent(deps.db, {
    appId: run.appId,
    actorPrincipalId: run.requestedByPrincipalId,
    action: `validation.${finalStatus}`,
    targetType: "validation_run",
    targetId: run.id,
    metadata: { releaseEligible: run.releaseEligible, mandatoryGatesTotal: run.mandatoryGatesTotal, mandatoryGatesPassed: run.mandatoryGatesPassed },
  });

  return { kind: "completed", run };
}

export { releaseLease };
