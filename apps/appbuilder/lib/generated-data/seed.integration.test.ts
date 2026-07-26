import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getTemplate } from "@asafarim/appbuilder-runtime";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { createApp } from "../repositories/apps";
import { requestPreviewBuild } from "../repositories/previewService";
import { applyTemplateVersion } from "../repositories/templateApplication";
import { generatedAppMembers, generatedRecords, previewBuilds, releases, specifications } from "../db/schema";
import { generateId } from "../db/ids";
import { ConflictError } from "../errors";
import { getOwnMembership } from "./membership";
import { ReleasedAppResetError, resetGeneratedData } from "./seed";

const db = getTestDb();

const owner = { principalId: "seed-owner", roles: [] };

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

async function makeTaskAppWithTemplate(name: string, suffix: string) {
  const app = await createApp(
    db,
    owner,
    { name, slug: `${suffix}-${Math.random().toString(36).slice(2, 8)}`, description: "d", prompt: "p", starterFamily: "task_management", visibility: "private" },
    `create-${suffix}`,
  );
  const template = getTemplate("task_management");
  if (!template) throw new Error("task_management template is not registered");
  await applyTemplateVersion(db, owner, app.id, { template, baseVersionNumber: 1, idempotencyKey: `${suffix}-template` });
  return app;
}

describe("resetGeneratedData", () => {
  it("requires explicit confirm:true", async () => {
    const app = await makeTaskAppWithTemplate("Confirm App", "seed-1");
    await requestPreviewBuild(db, owner, app.id);
    await expect(resetGeneratedData(db, owner, app.id, { confirm: false })).rejects.toBeInstanceOf(ConflictError);
  });

  it("requires a pinned preview to already exist", async () => {
    const app = await makeTaskAppWithTemplate("No Pin Yet App", "seed-2");
    // Deliberately never calling requestPreviewBuild.
    await expect(resetGeneratedData(db, owner, app.id, { confirm: true })).rejects.toBeInstanceOf(ConflictError);
  });

  it("is blocked for an app with a published release", async () => {
    const app = await makeTaskAppWithTemplate("Released App", "seed-3");
    await requestPreviewBuild(db, owner, app.id);

    await db.insert(releases).values({
      id: generateId(),
      appId: app.id,
      specificationVersionId: await currentVersionIdFor(app.id),
      versionLabel: "v1.0.0",
      status: "published",
      publishedByPrincipalId: owner.principalId,
      publishedAt: new Date(),
    });

    await expect(resetGeneratedData(db, owner, app.id, { confirm: true })).rejects.toBeInstanceOf(ReleasedAppResetError);
  });

  it("seeds deterministic demo data and bootstraps the owner as admin", async () => {
    const app = await makeTaskAppWithTemplate("Seed Data App", "seed-4");
    await requestPreviewBuild(db, owner, app.id);
    await resetGeneratedData(db, owner, app.id, { confirm: true });

    const membership = await getOwnMembership(db, owner, app.id);
    expect(membership?.roleIds).toEqual(["admin"]);

    const teamMembers = await db.select().from(generatedRecords).where(and(eq(generatedRecords.appId, app.id), eq(generatedRecords.entityId, "team_member")));
    const projects = await db.select().from(generatedRecords).where(and(eq(generatedRecords.appId, app.id), eq(generatedRecords.entityId, "project")));
    const tasks = await db.select().from(generatedRecords).where(and(eq(generatedRecords.appId, app.id), eq(generatedRecords.entityId, "task")));
    expect(teamMembers).toHaveLength(2);
    expect(projects).toHaveLength(2);
    expect(tasks).toHaveLength(4);
  });

  it("is idempotent: resetting twice does not error or duplicate records/members", async () => {
    const app = await makeTaskAppWithTemplate("Idempotent Seed App", "seed-5");
    await requestPreviewBuild(db, owner, app.id);
    await resetGeneratedData(db, owner, app.id, { confirm: true });
    await resetGeneratedData(db, owner, app.id, { confirm: true });

    const teamMembers = await db.select().from(generatedRecords).where(and(eq(generatedRecords.appId, app.id), eq(generatedRecords.entityId, "team_member")));
    const projects = await db.select().from(generatedRecords).where(and(eq(generatedRecords.appId, app.id), eq(generatedRecords.entityId, "project")));
    const tasks = await db.select().from(generatedRecords).where(and(eq(generatedRecords.appId, app.id), eq(generatedRecords.entityId, "task")));
    expect(teamMembers).toHaveLength(2);
    expect(projects).toHaveLength(2);
    expect(tasks).toHaveLength(4);

    const members = await db.select().from(generatedAppMembers).where(eq(generatedAppMembers.appId, app.id));
    // owner (admin) + demo-manager + demo-employee, not duplicated.
    expect(members).toHaveLength(3);
  });

  it("M11: never deletes a PRODUCTION record, even one for the same app/entity a preview reset also touches", async () => {
    const app = await makeTaskAppWithTemplate("Environment Isolation App", "seed-6");
    await requestPreviewBuild(db, owner, app.id);
    await resetGeneratedData(db, owner, app.id, { confirm: true });

    // A real production record, inserted the way the deployment pipeline's
    // metadata runtime would (never through resetGeneratedData, which is
    // preview-only by construction).
    const productionRecordId = generateId();
    await db.insert(generatedRecords).values({
      id: productionRecordId,
      appId: app.id,
      environment: "production",
      entityId: "project",
      specVersionNumber: 1,
      revision: 1,
      data: { name: "Real Customer Project", description: "Not demo data.", status: "active" },
      status: "active",
      createdByPrincipalId: "real-end-user",
      updatedByPrincipalId: "real-end-user",
    });

    // Reset preview demo data again — this must be a complete no-op for the
    // production row above.
    await resetGeneratedData(db, owner, app.id, { confirm: true });

    const [survivor] = await db.select().from(generatedRecords).where(eq(generatedRecords.id, productionRecordId));
    expect(survivor).toBeTruthy();
    expect(survivor.environment).toBe("production");
    expect(survivor.data).toEqual({ name: "Real Customer Project", description: "Not demo data.", status: "active" });

    // Preview's own project rows are still exactly the demo set (2) — the
    // production row is never counted among them.
    const previewProjects = await db
      .select()
      .from(generatedRecords)
      .where(and(eq(generatedRecords.appId, app.id), eq(generatedRecords.entityId, "project"), eq(generatedRecords.environment, "preview")));
    expect(previewProjects).toHaveLength(2);
  });
});

async function currentVersionIdFor(appId: string): Promise<string> {
  const [specRow] = await db.select().from(specifications).where(eq(specifications.appId, appId)).limit(1);
  if (!specRow.pinnedPreviewBuildId) throw new Error("test setup: app has no pinned preview build");
  const [build] = await db.select().from(previewBuilds).where(eq(previewBuilds.id, specRow.pinnedPreviewBuildId)).limit(1);
  return build.specificationVersionId;
}
