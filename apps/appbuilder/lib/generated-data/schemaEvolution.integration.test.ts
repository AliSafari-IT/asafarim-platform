import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getTemplate } from "@asafarim/appbuilder-runtime";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { createApp } from "../repositories/apps";
import { requestPreviewBuild } from "../repositories/previewService";
import { applyTemplateVersion } from "../repositories/templateApplication";
import { bootstrapOwnerAsAdmin } from "./membership";
import { loadPinnedSpec, resolveRuntimeContext, type RuntimeContext } from "./runtimeAuth";
import { createRecord } from "./records";
import { checkExistingRecordsAgainstField } from "./schemaEvolution";

const db = getTestDb();

const owner = { principalId: "evolution-owner", roles: [] };

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

async function makeTaskApp(name: string, suffix: string) {
  const app = await createApp(
    db,
    owner,
    { name, slug: `${suffix}-${Math.random().toString(36).slice(2, 8)}`, description: "d", prompt: "p", starterFamily: "task_management", visibility: "private" },
    `create-${suffix}`,
  );
  const template = getTemplate("task_management");
  if (!template) throw new Error("task_management template is not registered");
  await applyTemplateVersion(db, owner, app.id, { template, baseVersionNumber: 1, idempotencyKey: `${suffix}-template` });
  await requestPreviewBuild(db, owner, app.id);
  return app;
}

async function adminCtx(appId: string): Promise<RuntimeContext> {
  await bootstrapOwnerAsAdmin(db, owner, appId, "admin");
  return resolveRuntimeContext(db, owner, appId);
}

describe("checkExistingRecordsAgainstField", () => {
  it("returns no violations when every existing record already satisfies the tightened field", async () => {
    const app = await makeTaskApp("Clean Evolution App", "evo-1");
    const ctx = await adminCtx(app.id);
    await createRecord(db, ctx, "project", { name: "P1", status: "planning", deadline: "2026-09-01" }, "evo-1-p1");
    await createRecord(db, ctx, "project", { name: "P2", status: "active", deadline: "2026-10-01" }, "evo-1-p2");

    const { spec } = await loadPinnedSpec(db, app.id);
    const entity = spec.entities.find((e) => e.id === "project")!;
    const deadlineField = entity.fields.find((f) => f.id === "deadline")!;
    const tightened = { ...deadlineField, required: true };

    const violations = await checkExistingRecordsAgainstField(db, app.id, "project", tightened as typeof deadlineField);
    expect(violations).toHaveLength(0);
  });

  it("reports a violation for every existing record that would fail a tightened required constraint", async () => {
    const app = await makeTaskApp("Required Violation App", "evo-2");
    const ctx = await adminCtx(app.id);
    // `deadline` is optional on the template — create one record that
    // supplies it and one that omits it (stored as null).
    await createRecord(db, ctx, "project", { name: "Has deadline", status: "planning", deadline: "2026-09-01" }, "evo-2-p1");
    const withoutDeadline = await createRecord(db, ctx, "project", { name: "No deadline", status: "planning" }, "evo-2-p2");

    const { spec } = await loadPinnedSpec(db, app.id);
    const entity = spec.entities.find((e) => e.id === "project")!;
    const deadlineField = entity.fields.find((f) => f.id === "deadline")!;
    const tightened = { ...deadlineField, required: true };

    const violations = await checkExistingRecordsAgainstField(db, app.id, "project", tightened as typeof deadlineField);
    expect(violations.map((v) => v.recordId)).toEqual([withoutDeadline.id]);
  });

  it("reports duplicate-value violations for every existing record that would fail a tightened unique constraint", async () => {
    const app = await makeTaskApp("Unique Violation App", "evo-3");
    const ctx = await adminCtx(app.id);
    const first = await createRecord(db, ctx, "project", { name: "Same Name", status: "planning" }, "evo-3-p1");
    const second = await createRecord(db, ctx, "project", { name: "Same Name", status: "active" }, "evo-3-p2");
    void first;

    const { spec } = await loadPinnedSpec(db, app.id);
    const entity = spec.entities.find((e) => e.id === "project")!;
    const nameField = entity.fields.find((f) => f.id === "name")!;
    const tightened = { ...nameField, unique: true };

    const violations = await checkExistingRecordsAgainstField(db, app.id, "project", tightened as typeof nameField);
    expect(violations.map((v) => v.recordId)).toEqual([second.id]);
  });

  it("is scoped to the requested app — a same-named record in a DIFFERENT app is never counted as a duplicate", async () => {
    const appOne = await makeTaskApp("Scoped Evolution App One", "evo-4a");
    const appTwo = await makeTaskApp("Scoped Evolution App Two", "evo-4b");
    const ctxOne = await adminCtx(appOne.id);
    await bootstrapOwnerAsAdmin(db, owner, appTwo.id, "admin");
    const ctxTwo = await resolveRuntimeContext(db, owner, appTwo.id);

    await createRecord(db, ctxOne, "project", { name: "Shared Name", status: "planning" }, "evo-4a-p");
    await createRecord(db, ctxTwo, "project", { name: "Shared Name", status: "planning" }, "evo-4b-p");

    const { spec } = await loadPinnedSpec(db, appOne.id);
    const entity = spec.entities.find((e) => e.id === "project")!;
    const nameField = entity.fields.find((f) => f.id === "name")!;
    const violations = await checkExistingRecordsAgainstField(db, appOne.id, "project", { ...nameField, unique: true } as typeof nameField);
    expect(violations).toHaveLength(0);
  });
});
