import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getTemplate } from "@asafarim/appbuilder-runtime";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { createApp } from "../repositories/apps";
import { requestPreviewBuild } from "../repositories/previewService";
import { applyTemplateVersion } from "../repositories/templateApplication";
import { generatedRecords } from "../db/schema";
import { generateId } from "../db/ids";
import { bootstrapOwnerAsAdmin } from "./membership";
import { resolveRuntimeContext, loadPinnedSpec, type RuntimeContext } from "./runtimeAuth";
import { archiveRecord, createRecord } from "./records";
import { applyDeleteBehaviorOnArchive, validateRelationTarget, InvalidRelationTargetError } from "./relations";

const db = getTestDb();

const owner = { principalId: "relations-owner", roles: [] };

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
    {
      name,
      slug: `${suffix}-${Math.random().toString(36).slice(2, 8)}`,
      description: "d",
      prompt: "p",
      starterFamily: "task_management",
      visibility: "private",
    },
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

describe("relation target validation", () => {
  it("accepts a valid same-app, same-entity-direction relation target", async () => {
    const app = await makeTaskApp("Valid Relation App", "rel-1");
    const ctx = await adminCtx(app.id);
    const project = await createRecord(db, ctx, "project", { name: "Target Project", status: "planning" }, "rel-1-p");
    const task = await createRecord(db, ctx, "task", { title: "Has valid ref", status: "todo", priority: "low", project_ref: project.id }, "rel-1-t");
    expect(task.data.project_ref).toBe(project.id);
  });

  it("rejects a relation target that does not exist in this app", async () => {
    const app = await makeTaskApp("Missing Target App", "rel-2");
    const ctx = await adminCtx(app.id);
    await expect(
      createRecord(db, ctx, "task", { title: "Bad ref", status: "todo", priority: "low", project_ref: "nonexistent-record-id" }, "rel-2-t"),
    ).rejects.toBeInstanceOf(InvalidRelationTargetError);
  });

  it("rejects a relation target belonging to a DIFFERENT app, even with a real record id", async () => {
    const appOne = await makeTaskApp("Relation App One", "rel-3");
    const appTwo = await makeTaskApp("Relation App Two", "rel-4");
    const ctxOne = await adminCtx(appOne.id);
    await bootstrapOwnerAsAdmin(db, owner, appTwo.id, "admin");
    const ctxTwo = await resolveRuntimeContext(db, owner, appTwo.id);

    const projectInAppTwo = await createRecord(db, ctxTwo, "project", { name: "Cross App Project", status: "planning" }, "rel-4-p");

    await expect(
      createRecord(db, ctxOne, "task", { title: "Cross app ref", status: "todo", priority: "low", project_ref: projectInAppTwo.id }, "rel-3-t"),
    ).rejects.toBeInstanceOf(InvalidRelationTargetError);

    // Direct relations.ts-level check, for the precise error type.
    const { spec } = await loadPinnedSpec(db, appOne.id);
    await expect(
      validateRelationTarget(db, appOne.id, spec, "task_project", "task", projectInAppTwo.id),
    ).rejects.toBeInstanceOf(InvalidRelationTargetError);
  });

  it("rejects a relation target that is archived", async () => {
    const app = await makeTaskApp("Archived Target App", "rel-5");
    const ctx = await adminCtx(app.id);
    const project = await createRecord(db, ctx, "project", { name: "Will be archived", status: "planning" }, "rel-5-p");
    await archiveRecord(db, ctx, "project", project.id);
    await expect(
      createRecord(db, ctx, "task", { title: "Ref to archived", status: "todo", priority: "low", project_ref: project.id }, "rel-5-t"),
    ).rejects.toBeInstanceOf(InvalidRelationTargetError);
  });

  it("rejects a relation field's value referencing the wrong direction/entity", async () => {
    const app = await makeTaskApp("Wrong Direction App", "rel-6");
    const ctx = await adminCtx(app.id);
    const { spec } = await loadPinnedSpec(db, app.id);
    // task_project is declared fromEntityId="task" — calling it as if the
    // record carrying the field were a "project" must fail structurally.
    const project = await createRecord(db, ctx, "project", { name: "P", status: "planning" }, "rel-6-p");
    await expect(validateRelationTarget(db, app.id, spec, "task_project", "project", project.id)).rejects.toBeInstanceOf(
      InvalidRelationTargetError,
    );
  });
});

describe("onDelete: cascade (task_project)", () => {
  it("archiving a project cascades to archive every task referencing it", async () => {
    const app = await makeTaskApp("Cascade App", "rel-7");
    const ctx = await adminCtx(app.id);
    const project = await createRecord(db, ctx, "project", { name: "Cascade Project", status: "planning" }, "rel-7-p");
    const task1 = await createRecord(db, ctx, "task", { title: "T1", status: "todo", priority: "low", project_ref: project.id }, "rel-7-t1");
    const task2 = await createRecord(db, ctx, "task", { title: "T2", status: "todo", priority: "low", project_ref: project.id }, "rel-7-t2");

    await archiveRecord(db, ctx, "project", project.id);

    const [row1] = await db.select().from(generatedRecords).where(eq(generatedRecords.id, task1.id));
    const [row2] = await db.select().from(generatedRecords).where(eq(generatedRecords.id, task2.id));
    expect(row1.status).toBe("archived");
    expect(row2.status).toBe("archived");
  });

  it("does not cascade-archive unrelated tasks (only referencing tasks are touched)", async () => {
    const app = await makeTaskApp("Cascade Unrelated App", "rel-8");
    const ctx = await adminCtx(app.id);
    const project1 = await createRecord(db, ctx, "project", { name: "P1", status: "planning" }, "rel-8-p1");
    const project2 = await createRecord(db, ctx, "project", { name: "P2", status: "planning" }, "rel-8-p2");
    const taskOnP1 = await createRecord(db, ctx, "task", { title: "On P1", status: "todo", priority: "low", project_ref: project1.id }, "rel-8-t1");
    const taskOnP2 = await createRecord(db, ctx, "task", { title: "On P2", status: "todo", priority: "low", project_ref: project2.id }, "rel-8-t2");

    await archiveRecord(db, ctx, "project", project1.id);

    const [row1] = await db.select().from(generatedRecords).where(eq(generatedRecords.id, taskOnP1.id));
    const [row2] = await db.select().from(generatedRecords).where(eq(generatedRecords.id, taskOnP2.id));
    expect(row1.status).toBe("archived");
    expect(row2.status).toBe("active");
  });
});

describe("onDelete: setNull (task_assignee)", () => {
  it("archiving a team_member clears assignee_ref on tasks that referenced them, without archiving the tasks", async () => {
    const app = await makeTaskApp("SetNull App", "rel-9");
    const ctx = await adminCtx(app.id);
    const project = await createRecord(db, ctx, "project", { name: "P", status: "planning" }, "rel-9-p");

    // No role has create/delete permission on team_member in this template
    // (see taskManagement.ts's permissions array) — insert the row directly
    // and drive the archive through relations.ts's own cascade function
    // (exactly what records.ts#archiveRecord calls internally), so this
    // test exercises relations.ts's onDelete behavior directly rather than
    // records.ts's unrelated permission gate.
    const [member] = await db
      .insert(generatedRecords)
      .values({
        id: generateId(),
        appId: app.id,
        entityId: "team_member",
        specVersionNumber: ctx.specVersionNumber,
        revision: 1,
        data: { name: "M", email: `m-${Math.random().toString(36).slice(2, 6)}@example.test`, job_role: "employee" },
        status: "active",
        createdByPrincipalId: owner.principalId,
        updatedByPrincipalId: owner.principalId,
      })
      .returning();

    const task = await createRecord(
      db,
      ctx,
      "task",
      { title: "Assigned task", status: "todo", priority: "low", project_ref: project.id, assignee_ref: member.id },
      "rel-9-t",
    );

    const { spec } = await loadPinnedSpec(db, app.id);
    await db.transaction(async (tx) => {
      await applyDeleteBehaviorOnArchive(tx, app.id, spec, "team_member", member.id);
      await tx.update(generatedRecords).set({ status: "archived", archivedAt: new Date() }).where(eq(generatedRecords.id, member.id));
    });

    const [row] = await db.select().from(generatedRecords).where(eq(generatedRecords.id, task.id));
    expect(row.status).toBe("active");
    expect(row.data.assignee_ref).toBeNull();
  });
});
