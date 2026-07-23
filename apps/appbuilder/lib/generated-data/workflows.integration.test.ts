import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { checksumOf as specChecksumOf, ENGINE_VERSION, SPEC_SCHEMA_VERSION, type ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import { getTemplate } from "@asafarim/appbuilder-runtime";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { createApp } from "../repositories/apps";
import { requestPreviewBuild } from "../repositories/previewService";
import { applyTemplateVersion } from "../repositories/templateApplication";
import { generatedNotifications, generatedWorkflowExecutions, specifications, specificationVersions } from "../db/schema";
import { generateId } from "../db/ids";
import { bootstrapOwnerAsAdmin } from "./membership";
import { loadPinnedSpec, resolveRuntimeContext, type RuntimeContext } from "./runtimeAuth";
import { createRecord, getRecord, updateRecord } from "./records";
import { triggerWorkflows } from "./workflows";

const db = getTestDb();

const owner = { principalId: "workflows-owner", roles: [] };

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

/**
 * The task_management template ships with `workflows: []` — this appends
 * one more specification version defining two workflows so triggerWorkflows
 * (records.ts's post-mutation hook) has something to run:
 *  - `wf_high_priority`: onCreate(task) → condition(priority == "high") →
 *    updateField(status = "in_progress") → sendNotification.
 *  - `wf_protected_noop`: onUpdate(task) → updateField targeting the
 *    protected "id" field, which workflows.ts must silently ignore.
 */
async function makeTaskAppWithWorkflows(name: string, suffix: string) {
  const app = await createApp(
    db,
    owner,
    { name, slug: `${suffix}-${Math.random().toString(36).slice(2, 8)}`, description: "d", prompt: "p", starterFamily: "task_management", visibility: "private" },
    `create-${suffix}`,
  );
  const template = getTemplate("task_management");
  if (!template) throw new Error("task_management template is not registered");
  await applyTemplateVersion(db, owner, app.id, { template, baseVersionNumber: 1, idempotencyKey: `${suffix}-template` });

  const [specRow] = await db.select().from(specifications).where(eq(specifications.appId, app.id)).limit(1);
  const [currentVersion] = await db
    .select()
    .from(specificationVersions)
    .where(and(eq(specificationVersions.specificationId, specRow.id), eq(specificationVersions.versionNumber, specRow.currentVersionNumber)))
    .limit(1);
  const payload = currentVersion.payload as ApplicationSpecificationType;
  const nextPayload: ApplicationSpecificationType = {
    ...payload,
    workflows: [
      {
        id: "wf_high_priority",
        name: "High priority auto-start",
        trigger: { kind: "onCreate", entityId: "task" },
        archived: false,
        steps: [
          { id: "step_cond", kind: "condition", config: { fieldId: "priority", equals: "high" } },
          { id: "step_update", kind: "updateField", config: { fieldId: "status", value: "in_progress" } },
          { id: "step_notify", kind: "sendNotification", config: { title: "High priority task created", body: "Auto-started by workflow." } },
        ],
      },
      {
        id: "wf_protected_noop",
        name: "Protected field no-op",
        trigger: { kind: "onUpdate", entityId: "task" },
        archived: false,
        steps: [{ id: "step_bad_update", kind: "updateField", config: { fieldId: "id", value: "malicious-id" } }],
      },
    ],
  };
  const nextVersionNumber = specRow.currentVersionNumber + 1;
  await db.insert(specificationVersions).values({
    id: generateId(),
    specificationId: specRow.id,
    appId: app.id,
    versionNumber: nextVersionNumber,
    parentVersionId: currentVersion.id,
    schemaVersion: SPEC_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    summary: "Test-only: add workflows",
    payload: nextPayload,
    checksum: specChecksumOf(nextPayload),
    createdByPrincipalId: owner.principalId,
  });
  await db.update(specifications).set({ currentVersionNumber: nextVersionNumber }).where(eq(specifications.id, specRow.id));
  await requestPreviewBuild(db, owner, app.id);
  return app;
}

async function adminCtx(appId: string): Promise<RuntimeContext> {
  await bootstrapOwnerAsAdmin(db, owner, appId, "admin");
  return resolveRuntimeContext(db, owner, appId);
}

async function makeProject(ctx: RuntimeContext, key: string) {
  return createRecord(db, ctx, "project", { name: `Project ${key}`, status: "planning" }, `${key}-project`);
}

describe("triggerWorkflows via createRecord (onCreate)", () => {
  it("runs the condition→updateField→sendNotification chain when the condition matches", async () => {
    const app = await makeTaskAppWithWorkflows("Workflow Match App", "wf-1");
    const ctx = await adminCtx(app.id);
    const project = await makeProject(ctx, "wf-1");

    const created = await createRecord(db, ctx, "task", { title: "Urgent", status: "todo", priority: "high", project_ref: project.id }, "wf-1-create");
    // The function's own return value is the pre-workflow row — the
    // workflow's updateField ran as a separate DB write in the same
    // transaction, so re-fetch to observe its effect.
    const refetched = await getRecord(db, ctx, "task", created.id);
    expect(refetched.data.status).toBe("in_progress");

    const notifications = await db.select().from(generatedNotifications).where(eq(generatedNotifications.relatedRecordId, created.id));
    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toBe("High priority task created");
    expect(notifications[0].recipientPrincipalId).toBe(owner.principalId);

    const executions = await db.select().from(generatedWorkflowExecutions).where(eq(generatedWorkflowExecutions.triggerRecordId, created.id));
    expect(executions).toHaveLength(1);
    expect(executions[0].status).toBe("succeeded");
  });

  it("stops the chain (no updateField/notification) when the condition does not match", async () => {
    const app = await makeTaskAppWithWorkflows("Workflow No Match App", "wf-2");
    const ctx = await adminCtx(app.id);
    const project = await makeProject(ctx, "wf-2");

    const created = await createRecord(db, ctx, "task", { title: "Routine", status: "todo", priority: "low", project_ref: project.id }, "wf-2-create");
    const refetched = await getRecord(db, ctx, "task", created.id);
    expect(refetched.data.status).toBe("todo");

    const notifications = await db.select().from(generatedNotifications).where(eq(generatedNotifications.relatedRecordId, created.id));
    expect(notifications).toHaveLength(0);
  });
});

describe("workflow idempotency", () => {
  it("retrying createRecord with the same idempotencyKey does not duplicate the workflow execution or its notification", async () => {
    const app = await makeTaskAppWithWorkflows("Workflow Idempotent Create App", "wf-3");
    const ctx = await adminCtx(app.id);
    const project = await makeProject(ctx, "wf-3");

    const payload = { title: "Urgent Retry", status: "todo" as const, priority: "high" as const, project_ref: project.id };
    const first = await createRecord(db, ctx, "task", payload, "wf-3-same-key");
    const second = await createRecord(db, ctx, "task", payload, "wf-3-same-key");
    expect(second.id).toBe(first.id);

    const notifications = await db.select().from(generatedNotifications).where(eq(generatedNotifications.relatedRecordId, first.id));
    expect(notifications).toHaveLength(1);
    const executions = await db.select().from(generatedWorkflowExecutions).where(eq(generatedWorkflowExecutions.triggerRecordId, first.id));
    expect(executions).toHaveLength(1);
  });

  it("re-triggering the identical (workflowId, recordId, revision, triggerKind) event directly never re-executes (defense in depth at the workflow layer itself, independent of records.ts's own request-level idempotency)", async () => {
    const app = await makeTaskAppWithWorkflows("Workflow Direct Idempotent App", "wf-4");
    const ctx = await adminCtx(app.id);
    const project = await makeProject(ctx, "wf-4");
    // createRecord's own onCreate trigger already runs wf_high_priority
    // once for (recordId, revision=1, onCreate) — this establishes the
    // idempotency key this test then deliberately replays.
    const created = await createRecord(db, ctx, "task", { title: "Direct trigger", status: "todo", priority: "high", project_ref: project.id }, "wf-4-create");

    const notificationsAfterCreate = await db.select().from(generatedNotifications).where(eq(generatedNotifications.relatedRecordId, created.id));
    expect(notificationsAfterCreate).toHaveLength(1);

    const { spec } = await loadPinnedSpec(db, app.id);
    const triggerable = { id: created.id, revision: created.revision, createdByPrincipalId: created.createdByPrincipalId, data: created.data };

    // Same (workflowId, recordId, revision, triggerKind) as the automatic
    // trigger above — the generatedWorkflowExecutions UNIQUE index must
    // reject re-running it, called directly, bypassing records.ts entirely.
    await triggerWorkflows(db, owner, app.id, spec, "task", triggerable, "onCreate");
    await triggerWorkflows(db, owner, app.id, spec, "task", triggerable, "onCreate");

    const notifications = await db.select().from(generatedNotifications).where(eq(generatedNotifications.relatedRecordId, created.id));
    expect(notifications).toHaveLength(1);
    const executions = await db
      .select()
      .from(generatedWorkflowExecutions)
      .where(and(eq(generatedWorkflowExecutions.triggerRecordId, created.id), eq(generatedWorkflowExecutions.workflowId, "wf_high_priority")));
    expect(executions).toHaveLength(1);
  });
});

describe("allowlisted step safety", () => {
  it("an updateField step targeting a PROTECTED_SYSTEM_FIELD_NAMES key is silently ignored, never applied", async () => {
    const app = await makeTaskAppWithWorkflows("Protected Field Workflow App", "wf-5");
    const ctx = await adminCtx(app.id);
    const project = await makeProject(ctx, "wf-5");
    const created = await createRecord(db, ctx, "task", { title: "Untouchable id", status: "todo", priority: "low", project_ref: project.id }, "wf-5-create");

    const updated = await updateRecord(db, ctx, "task", created.id, { data: { status: "in_progress" }, baseRevision: 1, idempotencyKey: "wf-5-update" });
    // wf_protected_noop fires onUpdate and tries to set data.id — the record
    // row's real `id` column (and its `data` payload) must be untouched.
    expect(updated.id).toBe(created.id);
    const refetched = await getRecord(db, ctx, "task", created.id);
    expect(refetched.id).toBe(created.id);
    expect((refetched.data as Record<string, unknown>).id).toBeUndefined();
  });
});
