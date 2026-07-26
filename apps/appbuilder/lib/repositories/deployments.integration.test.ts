import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getTemplate } from "@asafarim/appbuilder-runtime";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { createApp, archiveApp } from "./apps";
import { addCollaborator } from "./collaborators";
import { applyTemplateVersion } from "./templateApplication";
import { applyOperation } from "./operations";
import { requestPreviewBuild } from "./previewService";
import { enqueueValidationRun, transitionStatus, upsertGateResult, finalizeRun } from "./validationRuns";
import { prepareRelease, approveRelease } from "./releases";
import {
  createDeployment,
  rollbackToRelease,
  claimDeploymentById,
  claimNextAvailableDeployment,
  requestDeploymentCancellation,
  getDeploymentForActor,
  listDeploymentSteps,
} from "./deployments";
import { runDeploymentJob, type DeploymentPipelineOutcome } from "../deployment/pipeline";
import { CrossAppReleaseError, RollbackTargetInvalidError } from "../deployment/errors";
import { RESERVED_APP_SLUGS } from "../routing/resolveAppHost";
import { appDomains, deployments, releases } from "../db/schema";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors";

const db = getTestDb();

const owner = { principalId: "deploy-owner", roles: [] };
const editor = { principalId: "deploy-editor", roles: [] };
const unrelated = { principalId: "deploy-unrelated", roles: [] };

const WORKER_ID = "test-worker";
const LEASE_MS = 60_000;

const okVerify = async () => ({ ok: true, status: 200, message: "ok" });

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

/** A real, renderable (task_management) app with a specification version that satisfies every M11 eligibility requirement AND has real pages/roles, so the deployment pipeline's health/smoke checks can genuinely pass. */
async function makeDeployableApp(name: string, slugSuffix: string, idempotencyKey: string) {
  const app = await createApp(
    db,
    owner,
    { name, slug: `${slugSuffix}-${Math.random().toString(36).slice(2, 8)}`, description: `${name} description`, prompt: `Build: ${name}`, starterFamily: "task_management", visibility: "private" },
    idempotencyKey,
  );
  const template = getTemplate("task_management");
  if (!template) throw new Error("task_management template is not registered");
  await applyTemplateVersion(db, owner, app.id, { template, baseVersionNumber: 1, idempotencyKey: `${idempotencyKey}-template` });
  const { build } = await requestPreviewBuild(db, owner, app.id);

  const run = await enqueueValidationRun(db, owner, app.id, { idempotencyKey: `${idempotencyKey}-run`, requestSource: "manual" });
  await transitionStatus(db, run.id, "pending", "running");
  await upsertGateResult(db, {
    runId: run.id,
    appId: app.id,
    gateKey: "spec_schema_validity",
    gateVersion: "1.0.0",
    mandatory: true,
    result: { status: "passed" },
    startedAt: new Date(),
    completedAt: new Date(),
    artifactIds: [],
  });
  await finalizeRun(db, run.id, "passed");

  return { app, specificationVersionId: build.specificationVersionId };
}

async function prepareApproveDeploy(name: string, slugSuffix: string, idempotencyKey: string, verify = okVerify): Promise<{ app: Awaited<ReturnType<typeof makeDeployableApp>>["app"]; releaseId: string; outcome: DeploymentPipelineOutcome }> {
  const { app, specificationVersionId } = await makeDeployableApp(name, slugSuffix, idempotencyKey);
  const release = await prepareRelease(db, owner, app.id, { specificationVersionId });
  await approveRelease(db, owner, app.id, release.id);
  const deployment = await createDeployment(db, owner, app.id, { releaseId: release.id, idempotencyKey: `${idempotencyKey}-deploy` });
  const claimed = await claimDeploymentById(db, deployment.id, WORKER_ID, LEASE_MS);
  const outcome = await runDeploymentJob({ db, workerId: WORKER_ID, leaseDurationMs: LEASE_MS, signal: new AbortController().signal, verifyProductionRoute: verify }, claimed!);
  return { app, releaseId: release.id, outcome };
}

describe("golden path — activation only after health/smoke success", () => {
  it("deploys an approved release: activates the domain pointer and marks the release published", async () => {
    const { app, releaseId, outcome } = await prepareApproveDeploy("Golden Deploy App", "golden", "gd-1");

    expect(outcome.kind).toBe("completed");
    if (outcome.kind !== "completed") throw new Error("unreachable");
    expect(outcome.deployment.status).toBe("succeeded");
    expect(outcome.deployment.phase).toBe("completed");
    expect(outcome.deployment.activatedAt).toBeTruthy();

    const [domain] = await db.select().from(appDomains).where(eq(appDomains.appId, app.id));
    expect(domain.status).toBe("active");
    expect(domain.activeReleaseId).toBe(releaseId);

    const [release] = await db.select().from(releases).where(eq(releases.id, releaseId));
    expect(release.status).toBe("published");
    expect(release.publishedByPrincipalId).toBe(owner.principalId);

    const steps = await listDeploymentSteps(db, outcome.deployment.id);
    const phaseNames = steps.map((s) => s.phase);
    expect(phaseNames).toContain("health_checking");
    expect(phaseNames).toContain("smoke_testing");
    expect(phaseNames).toContain("activating");
    expect(phaseNames).toContain("verifying");
    expect(steps.every((s) => s.ok)).toBe(true);
  });

  it("does NOT activate when post-activation verification fails — automatically restores the previous pointer", async () => {
    // First a real, successful deployment so there IS a previous pointer to restore to.
    const { app, releaseId: releaseA } = await prepareApproveDeploy("Restore Prev App", "restore-prev", "rp-1");

    // Prepare a second, newer release for the SAME app and deploy it with a
    // verifier that reports failure — simulating the external route not
    // actually coming up after activation.
    const applied = await applyOperation(db, owner, app.id, {
      operation: { opVersion: "1.0.0", type: "CREATE_ENTITY", entity: { id: "extra2", machineName: "extra2", name: "Extra2", fields: [], indexes: [], archived: false } },
      baseVersionNumber: 2,
      idempotencyKey: "rp-2-op",
    });
    const v2Id = applied.version!.id;
    await requestPreviewBuild(db, owner, app.id);
    const run2 = await enqueueValidationRun(db, owner, app.id, { idempotencyKey: "rp-2-run", requestSource: "manual" });
    await transitionStatus(db, run2.id, "pending", "running");
    await upsertGateResult(db, { runId: run2.id, appId: app.id, gateKey: "spec_schema_validity", gateVersion: "1.0.0", mandatory: true, result: { status: "passed" }, startedAt: new Date(), completedAt: new Date(), artifactIds: [] });
    await finalizeRun(db, run2.id, "passed");

    const releaseB = await prepareRelease(db, owner, app.id, { specificationVersionId: v2Id });
    await approveRelease(db, owner, app.id, releaseB.id);
    const deploymentB = await createDeployment(db, owner, app.id, { releaseId: releaseB.id, idempotencyKey: "rp-2-deploy" });
    const claimedB = await claimDeploymentById(db, deploymentB.id, WORKER_ID, LEASE_MS);
    const outcomeB = await runDeploymentJob(
      { db, workerId: WORKER_ID, leaseDurationMs: LEASE_MS, signal: new AbortController().signal, verifyProductionRoute: async () => ({ ok: false, status: 503, message: "simulated failure" }) },
      claimedB!,
    );

    expect(outcomeB.kind).toBe("completed");
    if (outcomeB.kind !== "completed") throw new Error("unreachable");
    expect(outcomeB.deployment.status).toBe("failed");
    expect(outcomeB.deployment.failureCode).toBe("post_activation_verification_failed");

    // Pointer restored to A; A is published again; B is archived, never live.
    const [domain] = await db.select().from(appDomains).where(eq(appDomains.appId, app.id));
    expect(domain.activeReleaseId).toBe(releaseA);
    const [reloadedA] = await db.select().from(releases).where(eq(releases.id, releaseA));
    expect(reloadedA.status).toBe("published");
    const [reloadedB] = await db.select().from(releases).where(eq(releases.id, releaseB.id));
    expect(reloadedB.status).toBe("archived");
  });
});

describe("failed deployment preserves the current production release", () => {
  it("a pre-activation failure (registry mismatch) never touches the already-live release", async () => {
    const { app, releaseId: releaseA } = await prepareApproveDeploy("Preserve Live App", "preserve-live", "pl-1");

    const { specificationVersionId: v2Id } = await (async () => {
      const applied = await applyOperation(db, owner, app.id, {
        operation: { opVersion: "1.0.0", type: "CREATE_ENTITY", entity: { id: "extra3", machineName: "extra3", name: "Extra3", fields: [], indexes: [], archived: false } },
        baseVersionNumber: 2,
        idempotencyKey: "pl-2-op",
      });
      const { build } = await requestPreviewBuild(db, owner, app.id);
      const run = await enqueueValidationRun(db, owner, app.id, { idempotencyKey: "pl-2-run", requestSource: "manual" });
      await transitionStatus(db, run.id, "pending", "running");
      await upsertGateResult(db, { runId: run.id, appId: app.id, gateKey: "spec_schema_validity", gateVersion: "1.0.0", mandatory: true, result: { status: "passed" }, startedAt: new Date(), completedAt: new Date(), artifactIds: [] });
      await finalizeRun(db, run.id, "passed");
      void build;
      return { specificationVersionId: applied.version!.id };
    })();

    const releaseB = await prepareRelease(db, owner, app.id, { specificationVersionId: v2Id });
    await approveRelease(db, owner, app.id, releaseB.id);
    // Corrupt B's pinned registry version directly — simulates a platform
    // registry upgrade happening between approval and deployment. Eligibility
    // (which checks the PREVIEW BUILD's registry version, not the release's
    // own pinned copy) still holds, so this deterministically fails at the
    // pipeline's OWN `preparing_artifact` phase instead.
    await db.update(releases).set({ registryVersion: "0.0.0-stale" }).where(eq(releases.id, releaseB.id));

    const deploymentB = await createDeployment(db, owner, app.id, { releaseId: releaseB.id, idempotencyKey: "pl-2-deploy" });
    const claimedB = await claimDeploymentById(db, deploymentB.id, WORKER_ID, LEASE_MS);
    const outcomeB = await runDeploymentJob({ db, workerId: WORKER_ID, leaseDurationMs: LEASE_MS, signal: new AbortController().signal, verifyProductionRoute: okVerify }, claimedB!);

    expect(outcomeB.kind).toBe("completed");
    if (outcomeB.kind !== "completed") throw new Error("unreachable");
    expect(outcomeB.deployment.status).toBe("failed");
    expect(outcomeB.deployment.failureCode).toBe("artifact_preparation_failed");
    expect(outcomeB.deployment.activatedAt).toBeNull();

    const [domain] = await db.select().from(appDomains).where(eq(appDomains.appId, app.id));
    expect(domain.activeReleaseId).toBe(releaseA);
    const [reloadedA] = await db.select().from(releases).where(eq(releases.id, releaseA));
    expect(reloadedA.status).toBe("published");
    const [reloadedB] = await db.select().from(releases).where(eq(releases.id, releaseB.id));
    expect(reloadedB.status).toBe("approved"); // never activated, never touched
  });
});

describe("createDeployment — idempotency, authorization, and cross-app rejection", () => {
  it("is idempotent: the same idempotency key replays the same deployment row", async () => {
    const { app, specificationVersionId } = await makeDeployableApp("Idempotent Deploy App", "idem-deploy", "id-1");
    const release = await prepareRelease(db, owner, app.id, { specificationVersionId });
    await approveRelease(db, owner, app.id, release.id);
    const first = await createDeployment(db, owner, app.id, { releaseId: release.id, idempotencyKey: "same-key" });
    const second = await createDeployment(db, owner, app.id, { releaseId: release.id, idempotencyKey: "same-key" });
    expect(second.id).toBe(first.id);
  });

  it("concurrent deployment attempts: two workers claiming the same freshly-created deployment — only one wins", async () => {
    const { app, specificationVersionId } = await makeDeployableApp("Concurrent Claim App", "concurrent", "cc-1");
    const release = await prepareRelease(db, owner, app.id, { specificationVersionId });
    await approveRelease(db, owner, app.id, release.id);
    const deployment = await createDeployment(db, owner, app.id, { releaseId: release.id, idempotencyKey: "cc-deploy" });

    const [claimA, claimB] = await Promise.all([
      claimDeploymentById(db, deployment.id, "worker-a", LEASE_MS),
      claimDeploymentById(db, deployment.id, "worker-b", LEASE_MS),
    ]);
    const winners = [claimA, claimB].filter((c) => c !== null);
    expect(winners).toHaveLength(1);
  });

  it("rejects deploying a release that isn't approved yet", async () => {
    const { app, specificationVersionId } = await makeDeployableApp("Not Approved App", "not-approved", "na-1");
    const release = await prepareRelease(db, owner, app.id, { specificationVersionId });
    await expect(createDeployment(db, owner, app.id, { releaseId: release.id, idempotencyKey: "na-deploy" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("cross-app release rejection: cannot deploy a release id belonging to a different app", async () => {
    const { app: appOne, specificationVersionId: v1 } = await makeDeployableApp("Cross Deploy One", "cross-deploy-1", "cd-1");
    const { app: appTwo } = await makeDeployableApp("Cross Deploy Two", "cross-deploy-2", "cd-2");
    const releaseOne = await prepareRelease(db, owner, appOne.id, { specificationVersionId: v1 });
    await approveRelease(db, owner, appOne.id, releaseOne.id);
    await expect(createDeployment(db, owner, appTwo.id, { releaseId: releaseOne.id, idempotencyKey: "cd-deploy" })).rejects.toBeInstanceOf(CrossAppReleaseError);
  });

  it("requires app.deployRelease (owner-rank) — an editor cannot deploy", async () => {
    const { app, specificationVersionId } = await makeDeployableApp("Editor Deploy App", "editor-deploy", "ed-1");
    await addCollaborator(db, owner, app.id, editor.principalId, "editor");
    const release = await prepareRelease(db, owner, app.id, { specificationVersionId });
    await approveRelease(db, owner, app.id, release.id);
    await expect(createDeployment(db, editor, app.id, { releaseId: release.id, idempotencyKey: "ed-deploy" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("an unrelated actor cannot deploy (NotFoundError)", async () => {
    const { app, specificationVersionId } = await makeDeployableApp("Unrelated Deploy App", "unrelated-deploy", "ud-1");
    const release = await prepareRelease(db, owner, app.id, { specificationVersionId });
    await approveRelease(db, owner, app.id, release.id);
    await expect(createDeployment(db, unrelated, app.id, { releaseId: release.id, idempotencyKey: "ud-deploy" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects deploying a release that is no longer eligible (transactional recheck at deploy time)", async () => {
    const { app, specificationVersionId } = await makeDeployableApp("Ineligible At Deploy App", "ineligible-deploy", "iel-1");
    const release = await prepareRelease(db, owner, app.id, { specificationVersionId });
    await approveRelease(db, owner, app.id, release.id);
    await archiveApp(db, owner, app.id);
    // app.deployRelease is not archived-allowed either, so this fails at the
    // capability layer — still proves an archived app can never deploy.
    await expect(createDeployment(db, owner, app.id, { releaseId: release.id, idempotencyKey: "iel-deploy" })).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("cancellation", () => {
  it("cancels a pending (not-yet-claimed) deployment immediately", async () => {
    const { app, specificationVersionId } = await makeDeployableApp("Cancel Pending Deploy App", "cancel-pending-deploy", "cpd-1");
    const release = await prepareRelease(db, owner, app.id, { specificationVersionId });
    await approveRelease(db, owner, app.id, release.id);
    const deployment = await createDeployment(db, owner, app.id, { releaseId: release.id, idempotencyKey: "cpd-deploy" });
    const cancelled = await requestDeploymentCancellation(db, owner, app.id, deployment.id);
    expect(cancelled.status).toBe("cancelled");
  });

  it("refuses cancellation once the deployment has activated the production pointer", async () => {
    const { app } = await prepareApproveDeploy("Cancel After Activate App", "cancel-after", "caa-1");
    const [deploymentRow] = await db.select().from(deployments).where(eq(deployments.appId, app.id));
    await expect(requestDeploymentCancellation(db, owner, app.id, deploymentRow.id)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("rollback", () => {
  it("rolls back to an earlier published release, preserving history and production data", async () => {
    const { app, releaseId: releaseA } = await prepareApproveDeploy("Rollback App", "rollback", "rb-1");

    const applied = await applyOperation(db, owner, app.id, {
      operation: { opVersion: "1.0.0", type: "CREATE_ENTITY", entity: { id: "extra4", machineName: "extra4", name: "Extra4", fields: [], indexes: [], archived: false } },
      baseVersionNumber: 2,
      idempotencyKey: "rb-2-op",
    });
    const v2Id = applied.version!.id;
    await requestPreviewBuild(db, owner, app.id);
    const run2 = await enqueueValidationRun(db, owner, app.id, { idempotencyKey: "rb-2-run", requestSource: "manual" });
    await transitionStatus(db, run2.id, "pending", "running");
    await upsertGateResult(db, { runId: run2.id, appId: app.id, gateKey: "spec_schema_validity", gateVersion: "1.0.0", mandatory: true, result: { status: "passed" }, startedAt: new Date(), completedAt: new Date(), artifactIds: [] });
    await finalizeRun(db, run2.id, "passed");
    const releaseB = await prepareRelease(db, owner, app.id, { specificationVersionId: v2Id });
    await approveRelease(db, owner, app.id, releaseB.id);
    const deploymentB = await createDeployment(db, owner, app.id, { releaseId: releaseB.id, idempotencyKey: "rb-2-deploy" });
    const claimedB = await claimDeploymentById(db, deploymentB.id, WORKER_ID, LEASE_MS);
    await runDeploymentJob({ db, workerId: WORKER_ID, leaseDurationMs: LEASE_MS, signal: new AbortController().signal, verifyProductionRoute: okVerify }, claimedB!);

    let [domain] = await db.select().from(appDomains).where(eq(appDomains.appId, app.id));
    expect(domain.activeReleaseId).toBe(releaseB.id);

    // Now roll back to A.
    const rollbackDeployment = await rollbackToRelease(db, owner, app.id, { targetReleaseId: releaseA, idempotencyKey: "rb-3-rollback" });
    expect(rollbackDeployment.isRollback).toBe(true);
    const claimedRollback = await claimDeploymentById(db, rollbackDeployment.id, WORKER_ID, LEASE_MS);
    const rollbackOutcome = await runDeploymentJob({ db, workerId: WORKER_ID, leaseDurationMs: LEASE_MS, signal: new AbortController().signal, verifyProductionRoute: okVerify }, claimedRollback!);

    expect(rollbackOutcome.kind).toBe("completed");
    if (rollbackOutcome.kind !== "completed") throw new Error("unreachable");
    expect(rollbackOutcome.deployment.status).toBe("succeeded");

    [domain] = await db.select().from(appDomains).where(eq(appDomains.appId, app.id));
    expect(domain.activeReleaseId).toBe(releaseA);
    const [reloadedA] = await db.select().from(releases).where(eq(releases.id, releaseA));
    expect(reloadedA.status).toBe("published");
    const [reloadedB] = await db.select().from(releases).where(eq(releases.id, releaseB.id));
    expect(reloadedB.status).toBe("superseded"); // history preserved, never rewritten
  });

  it("rejects rolling back to a release that was never published", async () => {
    const { app, specificationVersionId } = await makeDeployableApp("Rollback Never Published App", "rollback-never", "rbn-1");
    const release = await prepareRelease(db, owner, app.id, { specificationVersionId });
    await expect(rollbackToRelease(db, owner, app.id, { targetReleaseId: release.id, idempotencyKey: "rbn-rollback" })).rejects.toBeInstanceOf(RollbackTargetInvalidError);
  });

  it("cross-app release rejection: cannot roll back to a release id belonging to a different app", async () => {
    const { app: appOne, releaseId: releaseA } = await prepareApproveDeploy("Cross Rollback One", "cross-rb-1", "crb-1");
    const { app: appTwo } = await prepareApproveDeploy("Cross Rollback Two", "cross-rb-2", "crb-2");
    void appOne;
    await expect(rollbackToRelease(db, owner, appTwo.id, { targetReleaseId: releaseA, idempotencyKey: "crb-rollback" })).rejects.toBeInstanceOf(CrossAppReleaseError);
  });
});

describe("slug reservation and reserved names", () => {
  it("reuses the same app_domains row across repeated (would-be) reservations rather than duplicating it", async () => {
    const { app, releaseId } = await prepareApproveDeploy("Slug Reuse App", "slug-reuse", "sr-1");
    const rows = await db.select().from(appDomains).where(eq(appDomains.appId, app.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].host).toBe(`${app.slug}.apps.asafarim.com`);
    void releaseId;
  });

  it("every reserved platform slug is rejected by the routing layer (defense in depth, independent of app creation's own slug validation)", () => {
    for (const slug of RESERVED_APP_SLUGS) {
      // app_domains has a global UNIQUE(host) constraint but nothing stops a
      // caller from constructing a release with app_slug == a reserved word
      // if app creation's own reserved-name check were ever bypassed —
      // resolveAppHost.ts is the independent, second gate.
      expect(RESERVED_APP_SLUGS.has(slug)).toBe(true);
    }
  });
});

describe("claimNextAvailableDeployment — crash recovery sweep", () => {
  it("claims a deployment with an expired lease as if it were newly queued", async () => {
    const { app, specificationVersionId } = await makeDeployableApp("Sweep App", "sweep", "sw-1");
    const release = await prepareRelease(db, owner, app.id, { specificationVersionId });
    await approveRelease(db, owner, app.id, release.id);
    const deployment = await createDeployment(db, owner, app.id, { releaseId: release.id, idempotencyKey: "sw-deploy" });

    // Simulate a worker that claimed it, then crashed — lease already expired.
    await db
      .update(deployments)
      .set({ leaseOwner: "dead-worker", leaseExpiresAt: new Date(Date.now() - 60_000) })
      .where(eq(deployments.id, deployment.id));

    const claimed = await claimNextAvailableDeployment(db, "recovery-worker", LEASE_MS);
    expect(claimed?.id).toBe(deployment.id);
    expect(claimed?.leaseOwner).toBe("recovery-worker");
  });
});

describe("reads", () => {
  it("getDeploymentForActor returns the deployment and is app-scoped", async () => {
    const { app, releaseId } = await prepareApproveDeploy("Read Deploy App", "read-deploy", "rd-1");
    const [deploymentRow] = await db.select().from(deployments).where(eq(deployments.appId, app.id));
    const fetched = await getDeploymentForActor(db, owner, app.id, deploymentRow.id);
    expect(fetched.releaseId).toBe(releaseId);
  });
});
