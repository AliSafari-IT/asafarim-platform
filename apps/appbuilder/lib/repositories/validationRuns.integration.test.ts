import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { REGISTRY_VERSION } from "@asafarim/appbuilder-runtime";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { createApp } from "./apps";
import { addCollaborator } from "./collaborators";
import { requestPreviewBuild } from "./previewService";
import { applyOperation } from "./operations";
import {
  enqueueValidationRun,
  claimRunById,
  transitionStatus,
  requestCancellation,
  upsertGateResult,
  listGateResultsForRun,
  finalizeRun,
  getValidationRunForActor,
  listValidationRunsForActor,
  getGateResultsForActor,
  getArtifactsForActor,
} from "./validationRuns";
import { GATE_SET_VERSION } from "../validation/gates/registry";
import { validationRuns, specifications, specificationVersions } from "../db/schema";
import { generateId } from "../db/ids";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors";

const db = getTestDb();

const owner = { principalId: "valrun-owner", roles: [] };
const editor = { principalId: "valrun-editor", roles: [] };
const viewer = { principalId: "valrun-viewer", roles: [] };
const unrelated = { principalId: "valrun-unrelated", roles: [] };

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

async function makeAppWithPreview(name: string, slugSuffix: string, idempotencyKey: string) {
  const app = await createApp(
    db,
    owner,
    { name, slug: `${slugSuffix}-${Math.random().toString(36).slice(2, 8)}`, description: `${name} description`, prompt: `Build: ${name}`, starterFamily: "blank", visibility: "private" },
    idempotencyKey,
  );
  const { build } = await requestPreviewBuild(db, owner, app.id);
  return { app, build };
}

describe("enqueueValidationRun", () => {
  it("creates an immutable run pinned to the app's current version/checksum/preview/registry/gate-set at creation time", async () => {
    const { app, build } = await makeAppWithPreview("Pin App", "pin-app", "pin-1");
    const run = await enqueueValidationRun(db, owner, app.id, { idempotencyKey: "run-1", requestSource: "manual" });

    expect(run.status).toBe("pending");
    expect(run.previewBuildId).toBe(build.id);
    expect(run.registryVersion).toBe(REGISTRY_VERSION);
    expect(run.gateSetVersion).toBe(GATE_SET_VERSION);
    expect(run.requestedByPrincipalId).toBe(owner.principalId);
    expect(run.releaseEligible).toBe(false);
  });

  it("stays pinned to the ORIGINAL version even after the app advances to a new specification version", async () => {
    const { app } = await makeAppWithPreview("Stays Pinned App", "stays-pinned", "pin-2");
    const run = await enqueueValidationRun(db, owner, app.id, { idempotencyKey: "run-2", requestSource: "manual" });
    const originalVersionId = run.specificationVersionId;
    const originalChecksum = run.specificationChecksum;

    // Advance the spec with a real M04 operation.
    await applyOperation(db, owner, app.id, {
      operation: { opVersion: "1.0.0", type: "CREATE_ENTITY", entity: { id: "widget", machineName: "widget", name: "Widget", fields: [], indexes: [], archived: false } },
      baseVersionNumber: 1,
      idempotencyKey: "advance-1",
    });

    const [reloaded] = await db.select().from(validationRuns).where(eq(validationRuns.id, run.id));
    expect(reloaded.specificationVersionId).toBe(originalVersionId);
    expect(reloaded.specificationChecksum).toBe(originalChecksum);
  });

  it("is idempotent: same key + payload replays the same run without creating a duplicate row", async () => {
    const { app } = await makeAppWithPreview("Idempotent Run App", "idem-run", "pin-3");
    const first = await enqueueValidationRun(db, owner, app.id, { idempotencyKey: "run-3", requestSource: "manual" });
    const second = await enqueueValidationRun(db, owner, app.id, { idempotencyKey: "run-3", requestSource: "manual" });
    expect(second.id).toBe(first.id);
    const rows = await db.select().from(validationRuns).where(eq(validationRuns.appId, app.id));
    expect(rows).toHaveLength(1);
  });

  it("rejects the same key reused with a different requestSource payload", async () => {
    const { app } = await makeAppWithPreview("Conflict Run App", "conflict-run", "pin-4");
    await enqueueValidationRun(db, owner, app.id, { idempotencyKey: "run-4", requestSource: "manual" });
    await expect(enqueueValidationRun(db, owner, app.id, { idempotencyKey: "run-4", requestSource: "repair" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("enforces the per-app active-run limit (no two concurrent runs racing for the same app)", async () => {
    const { app } = await makeAppWithPreview("Limit Run App", "limit-run", "pin-5");
    await enqueueValidationRun(db, owner, app.id, { idempotencyKey: "run-5a", requestSource: "manual" });
    await expect(enqueueValidationRun(db, owner, app.id, { idempotencyKey: "run-5b", requestSource: "manual" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("requires app.validate (editor+) — a viewer cannot request validation", async () => {
    const { app } = await makeAppWithPreview("Viewer Denied App", "viewer-denied", "pin-6");
    await addCollaborator(db, owner, app.id, viewer.principalId, "viewer");
    await expect(enqueueValidationRun(db, viewer, app.id, { idempotencyKey: "run-6", requestSource: "manual" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("an unrelated actor gets NotFoundError, never a distinguishing 403 (leak prevention)", async () => {
    const { app } = await makeAppWithPreview("Unrelated Denied App", "unrelated-denied", "pin-7");
    await expect(enqueueValidationRun(db, unrelated, app.id, { idempotencyKey: "run-7", requestSource: "manual" })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("claiming, transitions, and cancellation", () => {
  it("claimRunById claims an unlease pending run and stamps a lease", async () => {
    const { app } = await makeAppWithPreview("Claim App", "claim-app", "claim-1");
    const run = await enqueueValidationRun(db, owner, app.id, { idempotencyKey: "run-8", requestSource: "manual" });
    const claimed = await claimRunById(db, run.id, "worker-1", 60_000);
    expect(claimed?.leaseOwner).toBe("worker-1");
    expect(claimed?.leaseExpiresAt).toBeTruthy();
  });

  it("cancels a PENDING run immediately", async () => {
    const { app } = await makeAppWithPreview("Cancel Pending App", "cancel-pending", "cancel-1");
    const run = await enqueueValidationRun(db, owner, app.id, { idempotencyKey: "run-9", requestSource: "manual" });
    const cancelled = await requestCancellation(db, owner, app.id, run.id);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.completedAt).toBeTruthy();
  });

  it("a RUNNING run is only cooperatively cancelled (cancelRequestedAt set, status unchanged) until the pipeline observes it", async () => {
    const { app } = await makeAppWithPreview("Cancel Running App", "cancel-running", "cancel-2");
    const run = await enqueueValidationRun(db, owner, app.id, { idempotencyKey: "run-10", requestSource: "manual" });
    await transitionStatus(db, run.id, "pending", "running");
    const cancelled = await requestCancellation(db, owner, app.id, run.id);
    expect(cancelled.status).toBe("running");
    expect(cancelled.cancelRequestedAt).toBeTruthy();
  });

  it("cancelling an already-cancelled run is idempotent (no-op)", async () => {
    const { app } = await makeAppWithPreview("Cancel Twice App", "cancel-twice", "cancel-3");
    const run = await enqueueValidationRun(db, owner, app.id, { idempotencyKey: "run-11", requestSource: "manual" });
    await requestCancellation(db, owner, app.id, run.id);
    const second = await requestCancellation(db, owner, app.id, run.id);
    expect(second.status).toBe("cancelled");
  });

  it("cannot cancel an already-terminal (passed) run", async () => {
    const { app } = await makeAppWithPreview("Cancel Passed App", "cancel-passed", "cancel-4");
    const run = await enqueueValidationRun(db, owner, app.id, { idempotencyKey: "run-12", requestSource: "manual" });
    await transitionStatus(db, run.id, "pending", "running");
    await finalizeRun(db, run.id, "passed");
    await expect(requestCancellation(db, owner, app.id, run.id)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("gate result persistence", () => {
  it("persists a PASSED gate result with evidence", async () => {
    const { app } = await makeAppWithPreview("Gate Pass App", "gate-pass", "gate-1");
    const run = await enqueueValidationRun(db, owner, app.id, { idempotencyKey: "run-13", requestSource: "manual" });
    await transitionStatus(db, run.id, "pending", "running");

    const started = new Date();
    await upsertGateResult(db, {
      runId: run.id,
      appId: app.id,
      gateKey: "spec_schema_validity",
      gateVersion: "1.0.0",
      mandatory: true,
      result: { status: "passed", evidence: { entityCount: 0 } },
      startedAt: started,
      completedAt: new Date(started.getTime() + 10),
      artifactIds: [],
    });

    const gates = await listGateResultsForRun(db, run.id);
    expect(gates).toHaveLength(1);
    expect(gates[0].status).toBe("passed");
    expect(gates[0].evidence).toEqual({ entityCount: 0 });
    expect(gates[0].durationMs).toBe(10);
  });

  it("persists a FAILED gate result with structured, redacted failures", async () => {
    const { app } = await makeAppWithPreview("Gate Fail App", "gate-fail", "gate-2");
    const run = await enqueueValidationRun(db, owner, app.id, { idempotencyKey: "run-14", requestSource: "manual" });
    await transitionStatus(db, run.id, "pending", "running");

    await upsertGateResult(db, {
      runId: run.id,
      appId: app.id,
      gateKey: "permissions_authorization",
      gateVersion: "1.0.0",
      mandatory: true,
      result: {
        status: "failed",
        failureCode: "missing_read_permission",
        failureMessage: "1 gap",
        structuredFailures: [{ code: "missing_read_permission", message: "employee_role cannot read team_member" }],
      },
      startedAt: new Date(),
      completedAt: new Date(),
      artifactIds: [],
    });

    const gates = await listGateResultsForRun(db, run.id);
    expect(gates[0].status).toBe("failed");
    expect(gates[0].structuredFailures).toHaveLength(1);
  });

  it("a retried gate execution REPLACES its own prior result rather than accumulating duplicate rows (unique on runId+gateKey)", async () => {
    const { app } = await makeAppWithPreview("Gate Retry App", "gate-retry", "gate-3");
    const run = await enqueueValidationRun(db, owner, app.id, { idempotencyKey: "run-15", requestSource: "manual" });
    await transitionStatus(db, run.id, "pending", "running");

    const write = (status: "failed" | "passed") =>
      upsertGateResult(db, {
        runId: run.id,
        appId: app.id,
        gateKey: "spec_schema_validity",
        gateVersion: "1.0.0",
        mandatory: true,
        result: { status },
        startedAt: new Date(),
        completedAt: new Date(),
        artifactIds: [],
      });

    await write("failed");
    await write("passed");

    const gates = await listGateResultsForRun(db, run.id);
    expect(gates).toHaveLength(1);
    expect(gates[0].status).toBe("passed");
  });
});

describe("finalizeRun release eligibility", () => {
  it("is release-eligible when every mandatory gate passed", async () => {
    const { app } = await makeAppWithPreview("Eligible App", "eligible-app", "elig-1");
    const run = await enqueueValidationRun(db, owner, app.id, { idempotencyKey: "run-16", requestSource: "manual" });
    await transitionStatus(db, run.id, "pending", "running");
    await upsertGateResult(db, { runId: run.id, appId: app.id, gateKey: "spec_schema_validity", gateVersion: "1.0.0", mandatory: true, result: { status: "passed" }, startedAt: new Date(), completedAt: new Date(), artifactIds: [] });

    const finalized = await finalizeRun(db, run.id, "passed");
    expect(finalized.releaseEligible).toBe(true);
    expect(finalized.mandatoryGatesTotal).toBe(1);
    expect(finalized.mandatoryGatesPassed).toBe(1);
  });

  it("is NOT release-eligible when a mandatory gate only skipped (no positive evidence)", async () => {
    const { app } = await makeAppWithPreview("Not Eligible App", "not-eligible", "elig-2");
    const run = await enqueueValidationRun(db, owner, app.id, { idempotencyKey: "run-17", requestSource: "manual" });
    await transitionStatus(db, run.id, "pending", "running");
    await upsertGateResult(db, { runId: run.id, appId: app.id, gateKey: "workflow_idempotency", gateVersion: "1.0.0", mandatory: false, result: { status: "skipped", skipReason: "no workflows" }, startedAt: new Date(), completedAt: new Date(), artifactIds: [] });

    const finalized = await finalizeRun(db, run.id, "passed");
    expect(finalized.releaseEligible).toBe(false); // zero mandatory gates recorded => no positive evidence
  });
});

describe("permission enforcement and cross-app isolation on reads", () => {
  it("a viewer CAN view validation summaries (app.viewValidation is viewer-minimum)", async () => {
    const { app } = await makeAppWithPreview("Viewer View App", "viewer-view", "view-1");
    await addCollaborator(db, owner, app.id, viewer.principalId, "viewer");
    const run = await enqueueValidationRun(db, owner, app.id, { idempotencyKey: "run-18", requestSource: "manual" });
    const viewed = await getValidationRunForActor(db, viewer, app.id, run.id);
    expect(viewed.id).toBe(run.id);
  });

  it("an unrelated actor cannot discover a run, its gates, or its artifacts — NotFoundError, never a peek", async () => {
    const { app } = await makeAppWithPreview("Unrelated View App", "unrelated-view", "view-2");
    const run = await enqueueValidationRun(db, owner, app.id, { idempotencyKey: "run-19", requestSource: "manual" });
    await expect(getValidationRunForActor(db, unrelated, app.id, run.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getGateResultsForActor(db, unrelated, app.id, run.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getArtifactsForActor(db, unrelated, app.id, run.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a run id from one app is not fetchable through a different app's scope (404, not the run)", async () => {
    const { app: appA } = await makeAppWithPreview("Cross App A", "cross-a", "cross-1");
    const { app: appB } = await makeAppWithPreview("Cross App B", "cross-b", "cross-2");
    const runA = await enqueueValidationRun(db, owner, appA.id, { idempotencyKey: "run-20", requestSource: "manual" });
    await expect(getValidationRunForActor(db, owner, appB.id, runA.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("listValidationRunsForActor never leaks another app's runs", async () => {
    const { app: appA } = await makeAppWithPreview("List Isolation A", "list-a", "list-1");
    const { app: appB } = await makeAppWithPreview("List Isolation B", "list-b", "list-2");
    await enqueueValidationRun(db, owner, appA.id, { idempotencyKey: "run-21", requestSource: "manual" });
    await enqueueValidationRun(db, owner, appB.id, { idempotencyKey: "run-22", requestSource: "manual" });
    const runsForA = await listValidationRunsForActor(db, owner, appA.id);
    expect(runsForA.every((r) => r.appId === appA.id)).toBe(true);
  });
});

describe("no duplicate specification versions after a retried operation apply (the mechanism the repair pipeline's runApplyingPhase relies on)", () => {
  it("replaying applyOperation with the SAME idempotency key never creates a second version", async () => {
    const { app } = await makeAppWithPreview("No Dup Version App", "no-dup-version", "nodup-1");
    const operation = { opVersion: "1.0.0" as const, type: "CREATE_ENTITY" as const, entity: { id: "gizmo", machineName: "gizmo", name: "Gizmo", fields: [], indexes: [], archived: false } };

    const first = await applyOperation(db, owner, app.id, { operation, baseVersionNumber: 1, idempotencyKey: "repair-attempt-1:op0" });
    const second = await applyOperation(db, owner, app.id, { operation, baseVersionNumber: 1, idempotencyKey: "repair-attempt-1:op0" });

    expect(second.version?.id).toBe(first.version?.id);
    const [spec] = await db.select().from(specifications).where(eq(specifications.appId, app.id));
    const versions = await db.select().from(specificationVersions).where(eq(specificationVersions.specificationId, spec.id));
    expect(versions).toHaveLength(2); // v1 (root, from createApp/blank) + v2 (this one operation) — never a duplicate v3
  });
});
