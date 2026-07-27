import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  closeTestDb,
  getTestDb,
  migrateTestDb,
  resetTestDb,
} from "../db/testUtils";
import { createApp } from "../repositories/apps";
import { addCollaborator } from "../repositories/collaborators";
import { NotFoundError } from "../errors";
import { buildAppReadinessSnapshot } from "./readiness";
import { deployments, releases, specificationVersions } from "../db/schema";
import { generateId } from "../db/ids";

const db = getTestDb();
const owner = { principalId: "readiness-owner", roles: [] };
const editor = { principalId: "readiness-editor", roles: [] };
const viewer = { principalId: "readiness-viewer", roles: [] };
const unrelated = { principalId: "readiness-unrelated", roles: [] };

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

describe("buildAppReadinessSnapshot", () => {
  it("gives the owner a full, honest snapshot for a brand-new app", async () => {
    const app = await createApp(
      db,
      owner,
      { name: "Readiness App", slug: "readiness-app" },
      "readiness-key"
    );
    const snapshot = await buildAppReadinessSnapshot(db, owner, app.id);

    expect(snapshot.role).toBe("owner");
    expect(snapshot.restricted).toBe(false);
    expect(snapshot.versions.draftVersionNumber).toBe(1);
    expect(snapshot.versions.previewBuild).toBeNull();
    expect(snapshot.versions.approvedRelease).toBeNull();
    expect(snapshot.versions.productionRelease).toBeNull();

    // Never optimistic: a never-validated, never-deployed app reports
    // "unknown", not a fake "healthy".
    expect(snapshot.validation.status).toBe("unknown");
    expect(snapshot.deployment.status).toBe("unknown");

    expect(snapshot.quotas).not.toBeNull();
    expect(snapshot.quotas!.length).toBeGreaterThan(0);
    for (const q of snapshot.quotas!) {
      expect(q.limit).toBeGreaterThan(0);
      expect(q.current).toBeGreaterThanOrEqual(0);
    }

    expect(snapshot.storage).toEqual({
      usedBytes: 0,
      limitBytes: expect.any(Number),
      exceeded: false,
    });
    expect(snapshot.customDomain.enabled).toBe(false);
    expect(snapshot.customDomain.request).toBeNull();

    // Launch-blocking issues must be honest and non-empty for a fresh app.
    expect(snapshot.launchBlockingIssues.length).toBeGreaterThan(0);
    expect(
      snapshot.launchBlockingIssues.some((i) =>
        i.includes("never been validated")
      )
    ).toBe(true);
    expect(
      snapshot.launchBlockingIssues.some((i) =>
        i.includes("No approved release")
      )
    ).toBe(true);
  });

  it("gives an editor the same full detail as an owner", async () => {
    const app = await createApp(
      db,
      owner,
      { name: "Readiness App 2", slug: "readiness-app-2" },
      "readiness-key-2"
    );
    await addCollaborator(db, owner, app.id, editor.principalId, "editor");

    const snapshot = await buildAppReadinessSnapshot(db, editor, app.id);
    expect(snapshot.role).toBe("editor");
    expect(snapshot.restricted).toBe(false);
    expect(snapshot.quotas).not.toBeNull();
    expect(snapshot.backup).not.toBeNull();
  });

  it("gives a viewer a restricted summary — operational internals are nulled out, not just hidden client-side", async () => {
    const app = await createApp(
      db,
      owner,
      { name: "Readiness App 3", slug: "readiness-app-3" },
      "readiness-key-3"
    );
    await addCollaborator(db, owner, app.id, viewer.principalId, "viewer");

    const snapshot = await buildAppReadinessSnapshot(db, viewer, app.id);
    expect(snapshot.role).toBe("viewer");
    expect(snapshot.restricted).toBe(true);

    expect(snapshot.quotas).toBeNull();
    expect(snapshot.storage).toBeNull();
    expect(snapshot.aiUsage).toBeNull();
    expect(snapshot.workflows).toBeNull();
    expect(snapshot.jobs).toBeNull();
    expect(snapshot.backup).toBeNull();
    expect(snapshot.security).toBeNull();
    expect(snapshot.recentOperationalEvents).toBeNull();

    // But the essentials — versions, validation, deployment health, and
    // launch-blocking issues — remain visible, matching what ValidationPanel/
    // DeploymentPanel already show a viewer elsewhere in the workspace.
    expect(snapshot.versions.draftVersionNumber).toBe(1);
    expect(snapshot.validation.status).toBe("unknown");
    expect(snapshot.launchBlockingIssues.length).toBeGreaterThan(0);
  });

  it("never lets an unrelated actor discover the app exists (NotFoundError, not an empty/restricted snapshot)", async () => {
    const app = await createApp(
      db,
      owner,
      { name: "Readiness App 4", slug: "readiness-app-4" },
      "readiness-key-4"
    );
    await expect(
      buildAppReadinessSnapshot(db, unrelated, app.id)
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("cross-app isolation: one app's readiness snapshot never reflects another app's data", async () => {
    const appA = await createApp(
      db,
      owner,
      { name: "App A", slug: "readiness-app-a" },
      "readiness-key-a"
    );
    const appB = await createApp(
      db,
      owner,
      { name: "App B", slug: "readiness-app-b" },
      "readiness-key-b"
    );

    const snapshotA = await buildAppReadinessSnapshot(db, owner, appA.id);
    const snapshotB = await buildAppReadinessSnapshot(db, owner, appB.id);

    expect(snapshotA.appId).toBe(appA.id);
    expect(snapshotB.appId).toBe(appB.id);
    // apps_per_owner is an OWNER-scoped quota — both apps see the SAME
    // owner-wide count (2), which is correct (not app-scoped double-counting).
    const quotaA = snapshotA.quotas!.find(
      (q) => q.metric === "apps_per_owner"
    )!;
    const quotaB = snapshotB.quotas!.find(
      (q) => q.metric === "apps_per_owner"
    )!;
    expect(quotaA.current).toBe(2);
    expect(quotaB.current).toBe(2);
    // But an app-scoped metric (e.g. specification_versions_per_app) must
    // NOT leak across apps.
    const versionsA = snapshotA.quotas!.find(
      (q) => q.metric === "specification_versions_per_app"
    )!;
    const versionsB = snapshotB.quotas!.find(
      (q) => q.metric === "specification_versions_per_app"
    )!;
    expect(versionsA.current).toBe(1);
    expect(versionsB.current).toBe(1);
  });

  it("surfaces rollback evidence in recent deployment events — golden-path step 12", async () => {
    const app = await createApp(
      db,
      owner,
      { name: "Rollback Evidence App", slug: "rollback-evidence-app" },
      "rollback-evidence-key"
    );
    const [version1] = await db
      .select()
      .from(specificationVersions)
      .where(eq(specificationVersions.appId, app.id))
      .limit(1);
    // Releases require distinct specification versions (unique on
    // (appId, specificationVersionId)) — insert a second version directly
    // rather than going through the full operation-engine round-trip,
    // since this test is about the readiness aggregation, not spec editing.
    const [version2] = await db
      .insert(specificationVersions)
      .values({
        ...version1,
        id: generateId(),
        versionNumber: 2,
        parentVersionId: version1.id,
      })
      .returning();

    // Two releases: an original forward deploy, and a rollback deployment
    // back to it — inserted directly (the deployment PIPELINE's own
    // correctness is already exhaustively covered by
    // lib/repositories/deployments.integration.test.ts and
    // tests/e2e/specs/m11-releases-deployment.spec.ts); this test is about
    // whether the READINESS AGGREGATION correctly surfaces rollback
    // evidence that already exists, not about re-deriving it.
    const [originalRelease] = await db
      .insert(releases)
      .values({
        id: generateId(),
        appId: app.id,
        specificationVersionId: version1.id,
        versionLabel: "v1",
      })
      .returning();
    const [newerRelease] = await db
      .insert(releases)
      .values({
        id: generateId(),
        appId: app.id,
        specificationVersionId: version2.id,
        versionLabel: "v2",
      })
      .returning();

    await db.insert(deployments).values({
      id: generateId(),
      appId: app.id,
      releaseId: originalRelease.id,
      environment: "production",
      status: "succeeded",
      isRollback: false,
      idempotencyKey: "deploy-1",
      deployedByPrincipalId: owner.principalId,
      activatedAt: new Date(Date.now() - 60_000),
    });
    await db.insert(deployments).values({
      id: generateId(),
      appId: app.id,
      releaseId: newerRelease.id,
      environment: "production",
      status: "succeeded",
      isRollback: false,
      supersededReleaseId: originalRelease.id,
      idempotencyKey: "deploy-2",
      deployedByPrincipalId: owner.principalId,
      activatedAt: new Date(Date.now() - 30_000),
    });
    const [rollbackDeployment] = await db
      .insert(deployments)
      .values({
        id: generateId(),
        appId: app.id,
        releaseId: originalRelease.id,
        environment: "production",
        status: "rolled_back",
        isRollback: true,
        supersededReleaseId: newerRelease.id,
        idempotencyKey: "deploy-3-rollback",
        deployedByPrincipalId: owner.principalId,
        activatedAt: new Date(),
        failureMessage: null,
      })
      .returning();

    const snapshot = await buildAppReadinessSnapshot(db, owner, app.id);
    const rollbackEvent = snapshot.deployment.recentEvents.find(
      (e) => e.id === rollbackDeployment.id
    );
    expect(rollbackEvent).toBeDefined();
    expect(rollbackEvent!.isRollback).toBe(true);
    expect(rollbackEvent!.status).toBe("rolled_back");
    expect(snapshot.deployment.recentEvents).toHaveLength(3);
    // Most-recent-first — the rollback (last activated) is first.
    expect(snapshot.deployment.recentEvents[0].id).toBe(rollbackDeployment.id);
  });
});
