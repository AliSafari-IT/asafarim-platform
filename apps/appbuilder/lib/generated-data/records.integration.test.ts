import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getTemplate } from "@asafarim/appbuilder-runtime";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { createApp } from "../repositories/apps";
import { requestPreviewBuild } from "../repositories/previewService";
import { applyTemplateVersion } from "../repositories/templateApplication";
import { generatedRecords } from "../db/schema";
import { bootstrapOwnerAsAdmin, addMember } from "./membership";
import { resolveRuntimeContext, RuntimePermissionDeniedError, type RuntimeContext } from "./runtimeAuth";
import { archiveRecord, createRecord, getRecord, RecordValidationError, restoreRecord, StaleRecordRevisionError, updateRecord } from "./records";
import { NotFoundError } from "../errors";

const db = getTestDb();

const owner = { principalId: "records-owner", roles: [] };
const managerPrincipal = { principalId: "records-manager", roles: [] };
const employeePrincipal = { principalId: "records-employee", roles: [] };

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

async function roleCtx(appId: string, principal: typeof managerPrincipal, roleId: string): Promise<RuntimeContext> {
  await addMember(db, owner, appId, { principalId: principal.principalId, roleIds: [roleId] });
  return resolveRuntimeContext(db, principal, appId);
}

describe("createRecord / getRecord", () => {
  it("creates a valid record and reads it back", async () => {
    const app = await makeTaskApp("Create App", "rec-1");
    const ctx = await adminCtx(app.id);
    const record = await createRecord(db, ctx, "project", { name: "Alpha", status: "planning" }, "create-rec-1");
    expect(record.data.name).toBe("Alpha");
    expect(record.revision).toBe(1);
    expect(record.status).toBe("active");

    const fetched = await getRecord(db, ctx, "project", record.id);
    expect(fetched.id).toBe(record.id);
  });

  it("rejects invalid record data with RecordValidationError", async () => {
    const app = await makeTaskApp("Invalid Create App", "rec-2");
    const ctx = await adminCtx(app.id);
    await expect(createRecord(db, ctx, "project", { status: "planning" }, "create-rec-2")).rejects.toBeInstanceOf(RecordValidationError);
  });

  it("is idempotent on idempotencyKey: same key replays the same record without creating a duplicate", async () => {
    const app = await makeTaskApp("Idempotent Create App", "rec-3");
    const ctx = await adminCtx(app.id);
    const first = await createRecord(db, ctx, "project", { name: "Idem", status: "planning" }, "same-key");
    const second = await createRecord(db, ctx, "project", { name: "Idem", status: "planning" }, "same-key");
    expect(second.id).toBe(first.id);

    const rows = await db.select().from(generatedRecords).where(and(eq(generatedRecords.appId, app.id), eq(generatedRecords.entityId, "project")));
    expect(rows).toHaveLength(1);
  });

  it("getRecord throws NotFoundError for a record in a different entity or app", async () => {
    const app = await makeTaskApp("Scoped Get App", "rec-4");
    const ctx = await adminCtx(app.id);
    const record = await createRecord(db, ctx, "project", { name: "Scoped", status: "planning" }, "create-rec-4");
    await expect(getRecord(db, ctx, "task", record.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("cannot smuggle protected system fields into a record's data", async () => {
    const app = await makeTaskApp("Injection App", "rec-5");
    const ctx = await adminCtx(app.id);
    await expect(
      createRecord(db, ctx, "project", { name: "Sneaky", status: "planning", id: "fake-id", revision: 999 }, "create-rec-5"),
    ).rejects.toBeInstanceOf(RecordValidationError);
  });

  it("rejects a create against an unknown entity id", async () => {
    const app = await makeTaskApp("Unknown Entity App", "rec-6");
    const ctx = await adminCtx(app.id);
    await expect(createRecord(db, ctx, "not_an_entity", { name: "x" }, "create-rec-6")).rejects.toThrow();
  });
});

describe("updateRecord — optimistic concurrency", () => {
  it("succeeds when baseRevision matches the current revision", async () => {
    const app = await makeTaskApp("Update App", "rec-7");
    const ctx = await adminCtx(app.id);
    const record = await createRecord(db, ctx, "project", { name: "V1", status: "planning" }, "create-rec-7");
    const updated = await updateRecord(db, ctx, "project", record.id, { data: { name: "V2" }, baseRevision: 1, idempotencyKey: "update-rec-7" });
    expect(updated.revision).toBe(2);
    expect(updated.data.name).toBe("V2");
  });

  it("rejects a stale baseRevision with StaleRecordRevisionError and leaves the row unchanged", async () => {
    const app = await makeTaskApp("Stale App", "rec-8");
    const ctx = await adminCtx(app.id);
    const record = await createRecord(db, ctx, "project", { name: "Original", status: "planning" }, "create-rec-8");
    await updateRecord(db, ctx, "project", record.id, { data: { name: "Updated once" }, baseRevision: 1, idempotencyKey: "update-rec-8a" });

    await expect(
      updateRecord(db, ctx, "project", record.id, { data: { name: "Stale write" }, baseRevision: 1, idempotencyKey: "update-rec-8b" }),
    ).rejects.toBeInstanceOf(StaleRecordRevisionError);

    const [row] = await db.select().from(generatedRecords).where(eq(generatedRecords.id, record.id));
    expect(row.data.name).toBe("Updated once");
    expect(row.revision).toBe(2);
  });

  it("is idempotent on (idempotencyKey, payload): retrying the same update does not bump the revision twice", async () => {
    const app = await makeTaskApp("Idempotent Update App", "rec-9");
    const ctx = await adminCtx(app.id);
    const record = await createRecord(db, ctx, "project", { name: "V1", status: "planning" }, "create-rec-9");
    const first = await updateRecord(db, ctx, "project", record.id, { data: { name: "V2" }, baseRevision: 1, idempotencyKey: "same-update-key" });
    const second = await updateRecord(db, ctx, "project", record.id, { data: { name: "V2" }, baseRevision: 1, idempotencyKey: "same-update-key" });
    expect(second.revision).toBe(first.revision);
    expect(second.revision).toBe(2);
  });

  it("merges partial data with existing fields rather than replacing the whole record", async () => {
    const app = await makeTaskApp("Merge App", "rec-10");
    const ctx = await adminCtx(app.id);
    const record = await createRecord(db, ctx, "project", { name: "Keep me", description: "Keep this too", status: "planning" }, "create-rec-10");
    const updated = await updateRecord(db, ctx, "project", record.id, { data: { status: "active" }, baseRevision: 1, idempotencyKey: "update-rec-10" });
    expect(updated.data.name).toBe("Keep me");
    expect(updated.data.description).toBe("Keep this too");
    expect(updated.data.status).toBe("active");
  });

  it("cannot smuggle protected system fields via an update payload", async () => {
    const app = await makeTaskApp("Update Injection App", "rec-11");
    const ctx = await adminCtx(app.id);
    const record = await createRecord(db, ctx, "project", { name: "X", status: "planning" }, "create-rec-11");
    await expect(
      updateRecord(db, ctx, "project", record.id, { data: { revision: 999 }, baseRevision: 1, idempotencyKey: "update-rec-11" }),
    ).rejects.toBeInstanceOf(RecordValidationError);
  });
});

// The task_management template's `permissions` array (see taskManagement.ts)
// grants CRUD only on `project` and `task` — no role has any permission on
// `team_member` at all (those records are only ever seeded directly by
// seed.ts, never created/archived through records.ts by an end user) — so
// these soft-delete tests use `project`, which admin has full create/read/
// update/delete on.
describe("archiveRecord / restoreRecord — soft delete only", () => {
  it("archives a record (status transitions to archived, row still exists)", async () => {
    const app = await makeTaskApp("Archive App", "rec-12");
    const ctx = await adminCtx(app.id);
    const record = await createRecord(db, ctx, "project", { name: "Casey Project", status: "planning" }, "create-rec-12");
    const archived = await archiveRecord(db, ctx, "project", record.id);
    expect(archived.status).toBe("archived");
    expect(archived.archivedAt).not.toBeNull();

    const [row] = await db.select().from(generatedRecords).where(eq(generatedRecords.id, record.id));
    expect(row).toBeDefined();
    expect(row.status).toBe("archived");
  });

  it("archiving is idempotent", async () => {
    const app = await makeTaskApp("Idempotent Archive App", "rec-13");
    const ctx = await adminCtx(app.id);
    const record = await createRecord(db, ctx, "project", { name: "Jamie Project", status: "planning" }, "create-rec-13");
    await archiveRecord(db, ctx, "project", record.id);
    const second = await archiveRecord(db, ctx, "project", record.id);
    expect(second.status).toBe("archived");
  });

  it("restores an archived record back to active", async () => {
    const app = await makeTaskApp("Restore App", "rec-14");
    const ctx = await adminCtx(app.id);
    const record = await createRecord(db, ctx, "project", { name: "Robin Project", status: "planning" }, "create-rec-14");
    await archiveRecord(db, ctx, "project", record.id);
    const restored = await restoreRecord(db, ctx, "project", record.id);
    expect(restored.status).toBe("active");
    expect(restored.archivedAt).toBeNull();
  });

  it("an archived record is not returned by getRecord's normal (active-only expectations still apply to update)", async () => {
    const app = await makeTaskApp("Archived Update App", "rec-15");
    const ctx = await adminCtx(app.id);
    const record = await createRecord(db, ctx, "project", { name: "Drew Project", status: "planning" }, "create-rec-15");
    await archiveRecord(db, ctx, "project", record.id);
    await expect(
      updateRecord(db, ctx, "project", record.id, { data: { name: "Drew 2" }, baseRevision: 1, idempotencyKey: "update-rec-15" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("admin/manager/employee_role permission matrix (project + task)", () => {
  it("admin can create/read/update/delete on project and task", async () => {
    const app = await makeTaskApp("Admin Matrix App", "matrix-1");
    const ctx = await adminCtx(app.id);
    const project = await createRecord(db, ctx, "project", { name: "P", status: "planning" }, "matrix-1-p");
    await updateRecord(db, ctx, "project", project.id, { data: { status: "active" }, baseRevision: 1, idempotencyKey: "matrix-1-pu" });
    const archived = await archiveRecord(db, ctx, "project", project.id);
    expect(archived.status).toBe("archived");

    const task = await createRecord(db, ctx, "task", { title: "T", status: "todo", priority: "low", project_ref: (await createRecord(db, ctx, "project", { name: "P2", status: "planning" }, "matrix-1-p2")).id }, "matrix-1-t");
    await updateRecord(db, ctx, "task", task.id, { data: { status: "in_progress" }, baseRevision: 1, idempotencyKey: "matrix-1-tu" });
    const archivedTask = await archiveRecord(db, ctx, "task", task.id);
    expect(archivedTask.status).toBe("archived");
  });

  it("manager can create/read/update but NOT delete project or task", async () => {
    const app = await makeTaskApp("Manager Matrix App", "matrix-2");
    const ctx = await roleCtx(app.id, managerPrincipal, "manager");
    const project = await createRecord(db, ctx, "project", { name: "Mgr Project", status: "planning" }, "matrix-2-p");
    await getRecord(db, ctx, "project", project.id);
    await updateRecord(db, ctx, "project", project.id, { data: { status: "active" }, baseRevision: 1, idempotencyKey: "matrix-2-pu" });
    await expect(archiveRecord(db, ctx, "project", project.id)).rejects.toBeInstanceOf(RuntimePermissionDeniedError);

    const task = await createRecord(db, ctx, "task", { title: "Mgr Task", status: "todo", priority: "low", project_ref: project.id }, "matrix-2-t");
    await updateRecord(db, ctx, "task", task.id, { data: { status: "in_progress" }, baseRevision: 1, idempotencyKey: "matrix-2-tu" });
    await expect(archiveRecord(db, ctx, "task", task.id)).rejects.toBeInstanceOf(RuntimePermissionDeniedError);
  });

  it("employee_role can read+update task and read-only project — no create/delete on either", async () => {
    const app = await makeTaskApp("Employee Matrix App", "matrix-3");
    const adminContext = await adminCtx(app.id);
    const project = await createRecord(db, adminContext, "project", { name: "Emp Project", status: "planning" }, "matrix-3-p");
    const task = await createRecord(db, adminContext, "task", { title: "Emp Task", status: "todo", priority: "low", project_ref: project.id }, "matrix-3-t");

    const ctx = await roleCtx(app.id, employeePrincipal, "employee_role");
    // read is allowed on both
    await getRecord(db, ctx, "project", project.id);
    await getRecord(db, ctx, "task", task.id);

    // update allowed on task
    const updated = await updateRecord(db, ctx, "task", task.id, { data: { status: "in_progress" }, baseRevision: 1, idempotencyKey: "matrix-3-tu" });
    expect(updated.data.status).toBe("in_progress");

    // update NOT allowed on project
    await expect(
      updateRecord(db, ctx, "project", project.id, { data: { status: "active" }, baseRevision: 1, idempotencyKey: "matrix-3-pu" }),
    ).rejects.toBeInstanceOf(RuntimePermissionDeniedError);

    // create NOT allowed on either
    await expect(createRecord(db, ctx, "project", { name: "Nope", status: "planning" }, "matrix-3-pc")).rejects.toBeInstanceOf(
      RuntimePermissionDeniedError,
    );
    await expect(
      createRecord(db, ctx, "task", { title: "Nope", status: "todo", priority: "low", project_ref: project.id }, "matrix-3-tc"),
    ).rejects.toBeInstanceOf(RuntimePermissionDeniedError);

    // delete (archive) NOT allowed on either
    await expect(archiveRecord(db, ctx, "task", task.id)).rejects.toBeInstanceOf(RuntimePermissionDeniedError);
    await expect(archiveRecord(db, ctx, "project", project.id)).rejects.toBeInstanceOf(RuntimePermissionDeniedError);
  });

  it("a role without permission on an entity gets RuntimePermissionDeniedError, never a silently-filtered/empty response", async () => {
    const app = await makeTaskApp("Denied Not Filtered App", "matrix-4");
    const ctx = await roleCtx(app.id, employeePrincipal, "employee_role");
    await expect(createRecord(db, ctx, "project", { name: "X", status: "planning" }, "matrix-4-c")).rejects.toBeInstanceOf(
      RuntimePermissionDeniedError,
    );
  });
});
