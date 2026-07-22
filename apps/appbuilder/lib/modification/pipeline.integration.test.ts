import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  createFakeProvider,
  ADD_PRIORITY_FIELD_SCRIPT,
  COMPACT_TABLE_SCRIPT,
  RESTRICT_PERMISSION_SCRIPT,
  GENERIC_MODIFICATION_FALLBACK_SCRIPT,
} from "@asafarim/appbuilder-ai";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { createApp } from "../repositories/apps";
import { applyOperation } from "../repositories/operations";
import { appendUserMessage } from "../repositories/conversations";
import {
  claimJobById,
  claimNextAvailableJob,
  confirmModification,
  enqueueModificationJob,
  getModificationJobForActor,
  requestCancellation,
  transitionStatus,
  type ModificationJobRow,
} from "../repositories/modificationJobs";
import { runModificationJob } from "./pipeline";
import { modificationOperationBatches, previewBuilds, specifications, specificationVersions } from "../db/schema";
import { StaleVersionError, NotFoundError } from "../errors";
import { ConfirmationExpiredError, ConfirmationInvalidError } from "../repositories/modificationJobs";

const db = getTestDb();
const owner = { principalId: "mod-pipeline-owner", roles: [] };
const unrelated = { principalId: "mod-pipeline-unrelated", roles: [] };

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

/** Builds a minimal task-app spec (entity `task` with title/status only — no `priority` yet — a `tasks` page with a `tasks_table` dataTable, and an `employee_role` with an existing task:delete allow) so the M08 fake-provider modification fixtures have real ids to reference. */
async function setupTaskApp(suffix: string) {
  const app = await createApp(
    db,
    owner,
    { name: `Mod App ${suffix}`, slug: `mod-app-${suffix}-${Math.random().toString(36).slice(2, 8)}` },
    `mod-create-${suffix}`,
  );
  let v = 1;
  await applyOperation(db, owner, app.id, {
    operation: { opVersion: "1.0.0", type: "CREATE_ENTITY", entity: { id: "task", machineName: "task", name: "Task" } },
    baseVersionNumber: v++,
    idempotencyKey: `${suffix}-create-entity`,
  });
  await applyOperation(db, owner, app.id, {
    operation: {
      opVersion: "1.0.0",
      type: "ADD_FIELD",
      entityId: "task",
      field: { id: "title", machineName: "title", name: "Title", type: "text", required: true, unique: false, archived: false },
    },
    baseVersionNumber: v++,
    idempotencyKey: `${suffix}-add-title`,
  });
  await applyOperation(db, owner, app.id, {
    operation: {
      opVersion: "1.0.0",
      type: "CREATE_PAGE",
      page: { id: "tasks", name: "Tasks", path: "tasks" },
    },
    baseVersionNumber: v++,
    idempotencyKey: `${suffix}-create-page`,
  });
  await applyOperation(db, owner, app.id, {
    operation: {
      opVersion: "1.0.0",
      type: "ADD_COMPONENT",
      pageId: "tasks",
      component: { id: "tasks_table", kind: "dataTable", entityId: "task", config: { variant: "table" }, order: 0 },
    },
    baseVersionNumber: v++,
    idempotencyKey: `${suffix}-add-component`,
  });
  await applyOperation(db, owner, app.id, {
    operation: { opVersion: "1.0.0", type: "CREATE_ROLE", role: { id: "employee_role", name: "Employee" } },
    baseVersionNumber: v++,
    idempotencyKey: `${suffix}-create-role`,
  });
  const { version } = await applyOperation(db, owner, app.id, {
    operation: {
      opVersion: "1.0.0",
      type: "SET_PERMISSION",
      permission: { id: "perm_employee_task_delete", roleId: "employee_role", entityId: "task", verb: "delete", effect: "allow" },
    },
    baseVersionNumber: v++,
    idempotencyKey: `${suffix}-set-permission`,
  });
  return { app, baseVersionNumber: version!.versionNumber };
}

async function sendMessageAndEnqueue(appId: string, content: string, suffix: string, baseVersionNumber: number) {
  const { message } = await appendUserMessage(db, owner, appId, { content, selectionContext: null, baseVersionNumber });
  const job = await enqueueModificationJob(db, owner, appId, {
    conversationId: message.conversationId,
    triggeringMessageId: message.id,
    userRequestText: content,
    selectionContext: null,
    idempotencyKey: `mod-job-${suffix}`,
  });
  return { message, job };
}

async function claimAndRun(job: ModificationJobRow, script: Parameters<typeof createFakeProvider>[0]) {
  const claimed = await claimJobById(db, job.id, "test-worker", 120_000);
  if (!claimed) throw new Error("expected to claim the freshly-enqueued job");
  const provider = createFakeProvider(script);
  return runModificationJob({ db, provider, workerId: "test-worker", leaseDurationMs: 120_000, signal: new AbortController().signal }, claimed);
}

describe("runModificationJob — safe (non-destructive) change golden path", () => {
  it("adds a priority field, reaches ready, persists a new version, and updates the preview pointer", async () => {
    const { app, baseVersionNumber } = await setupTaskApp("golden");
    const { job } = await sendMessageAndEnqueue(app.id, "Please add a priority field to tasks.", "golden", baseVersionNumber);

    const outcome = await claimAndRun(job, ADD_PRIORITY_FIELD_SCRIPT);
    expect(outcome.kind).toBe("yielded");
    if (outcome.kind !== "yielded") throw new Error("unreachable");
    expect(outcome.job.status).toBe("ready");
    expect(outcome.job.confirmationRequired).toBe(false);
    expect(outcome.job.resultingVersionNumber).toBe(baseVersionNumber + 1);
    expect(outcome.job.resultingPreviewBuildId).toBeTruthy();

    const [spec] = await db.select().from(specifications).where(eq(specifications.appId, app.id));
    expect(spec.currentVersionNumber).toBe(outcome.job.resultingVersionNumber);
    expect(spec.pinnedPreviewBuildId).toBe(outcome.job.resultingPreviewBuildId);

    const [build] = await db.select().from(previewBuilds).where(eq(previewBuilds.id, outcome.job.resultingPreviewBuildId!));
    expect(build.status).toBe("succeeded");

    const [version] = await db
      .select()
      .from(specificationVersions)
      .where(eq(specificationVersions.appId, app.id))
      .then((rows) => rows.filter((r) => r.versionNumber === outcome.job.resultingVersionNumber));
    expect((version.payload as any).entities.find((e: any) => e.id === "task").fields.some((f: any) => f.id === "priority")).toBe(true);
  });

  it("scopes a selection-context change to only the selected component — never touches unrelated components", async () => {
    const { app, baseVersionNumber } = await setupTaskApp("scoped");
    const { message } = await appendUserMessage(db, owner, app.id, {
      content: "Make this table more compact.",
      selectionContext: { appId: app.id, specificationVersionNumber: baseVersionNumber, pageId: "tasks", componentId: "tasks_table" },
      baseVersionNumber,
    });
    const job = await enqueueModificationJob(db, owner, app.id, {
      conversationId: message.conversationId,
      triggeringMessageId: message.id,
      userRequestText: "Make this table more compact.",
      selectionContext: { appId: app.id, specificationVersionNumber: baseVersionNumber, pageId: "tasks", componentId: "tasks_table" },
      idempotencyKey: "mod-job-scoped",
    });

    const outcome = await claimAndRun(job, COMPACT_TABLE_SCRIPT);
    expect(outcome.kind).toBe("yielded");
    if (outcome.kind !== "yielded") throw new Error("unreachable");
    expect(outcome.job.status).toBe("ready");

    const [version] = await db
      .select()
      .from(specificationVersions)
      .where(eq(specificationVersions.appId, app.id))
      .then((rows) => rows.filter((r) => r.versionNumber === outcome.job.resultingVersionNumber));
    const page = (version.payload as any).pages.find((p: any) => p.id === "tasks");
    const table = page.components.find((c: any) => c.id === "tasks_table");
    expect(table.config.density).toBe("compact");
  });

  it("fails safely on an ambiguous request instead of guessing", async () => {
    const { app, baseVersionNumber } = await setupTaskApp("ambiguous");
    const { job } = await sendMessageAndEnqueue(app.id, "Make it better.", "ambiguous", baseVersionNumber);

    const outcome = await claimAndRun(job, GENERIC_MODIFICATION_FALLBACK_SCRIPT);
    expect(outcome.kind).toBe("yielded");
    if (outcome.kind !== "yielded") throw new Error("unreachable");
    expect(outcome.job.status).toBe("failed");
    expect(outcome.job.failureCode).toBe("invalid_request");

    const [spec] = await db.select().from(specifications).where(eq(specifications.appId, app.id));
    expect(spec.currentVersionNumber).toBe(baseVersionNumber); // nothing applied
  });
});

describe("runModificationJob — destructive change requires explicit confirmation", () => {
  it("pauses at awaiting_confirmation with a checksum-bound proposal, applies nothing until confirmed", async () => {
    const { app, baseVersionNumber } = await setupTaskApp("destructive");
    const { job } = await sendMessageAndEnqueue(
      app.id,
      "Employees should no longer be able to delete tasks.",
      "destructive",
      baseVersionNumber,
    );

    const outcome = await claimAndRun(job, RESTRICT_PERMISSION_SCRIPT);
    expect(outcome.kind).toBe("yielded");
    if (outcome.kind !== "yielded") throw new Error("unreachable");
    expect(outcome.job.status).toBe("awaiting_confirmation");
    expect(outcome.job.confirmationRequired).toBe(true);
    expect(outcome.job.confirmationChecksum).toBeTruthy();
    expect(outcome.job.confirmationExpiresAt).toBeTruthy();

    const [spec] = await db.select().from(specifications).where(eq(specifications.appId, app.id));
    expect(spec.currentVersionNumber).toBe(baseVersionNumber); // nothing applied yet

    const [batch] = await db.select().from(modificationOperationBatches).where(eq(modificationOperationBatches.jobId, job.id));
    expect(batch.status).toBe("awaiting_confirmation");
    expect((batch.destructiveOperations as any[]).length).toBe(1);
  });

  it("applies the change only after a valid confirmation, reaching ready with a new version", async () => {
    const { app, baseVersionNumber } = await setupTaskApp("confirm-ok");
    const { job } = await sendMessageAndEnqueue(
      app.id,
      "Employees should no longer be able to delete tasks.",
      "confirm-ok",
      baseVersionNumber,
    );
    const proposed = await claimAndRun(job, RESTRICT_PERMISSION_SCRIPT);
    if (proposed.kind !== "yielded") throw new Error("unreachable");

    const confirmed = await confirmModification(db, owner, app.id, proposed.job.id, {
      checksum: proposed.job.confirmationChecksum!,
    });
    expect(confirmed.status).toBe("applying");

    const claimed = await claimJobById(db, confirmed.id, "test-worker-2", 120_000);
    const finalOutcome = await runModificationJob(
      { db, provider: createFakeProvider(RESTRICT_PERMISSION_SCRIPT), workerId: "test-worker-2", leaseDurationMs: 120_000, signal: new AbortController().signal },
      claimed!,
    );
    expect(finalOutcome.kind).toBe("yielded");
    if (finalOutcome.kind !== "yielded") throw new Error("unreachable");
    expect(finalOutcome.job.status).toBe("ready");

    const [version] = await db
      .select()
      .from(specificationVersions)
      .where(eq(specificationVersions.appId, app.id))
      .then((rows) => rows.filter((r) => r.versionNumber === finalOutcome.job.resultingVersionNumber));
    const permission = (version.payload as any).permissions.find((p: any) => p.id === "perm_employee_task_delete");
    expect(permission.effect).toBe("deny");
  });

  it("rejects confirmation with a forged/mismatched checksum", async () => {
    const { app, baseVersionNumber } = await setupTaskApp("forged");
    const { job } = await sendMessageAndEnqueue(app.id, "Employees should no longer be able to delete tasks.", "forged", baseVersionNumber);
    const proposed = await claimAndRun(job, RESTRICT_PERMISSION_SCRIPT);
    if (proposed.kind !== "yielded") throw new Error("unreachable");

    await expect(
      confirmModification(db, owner, app.id, proposed.job.id, { checksum: "forged-checksum-not-matching-anything" }),
    ).rejects.toBeInstanceOf(ConfirmationInvalidError);
  });

  it("rejects an expired confirmation and marks the job failed", async () => {
    const { app, baseVersionNumber } = await setupTaskApp("expired");
    const { job } = await sendMessageAndEnqueue(app.id, "Employees should no longer be able to delete tasks.", "expired", baseVersionNumber);
    const proposed = await claimAndRun(job, RESTRICT_PERMISSION_SCRIPT);
    if (proposed.kind !== "yielded") throw new Error("unreachable");

    // Simulate the confirmation window having already elapsed.
    await db
      .update((await import("../db/schema")).modificationJobs)
      .set({ confirmationExpiresAt: new Date(Date.now() - 1000) })
      .where(eq((await import("../db/schema")).modificationJobs.id, proposed.job.id));

    await expect(
      confirmModification(db, owner, app.id, proposed.job.id, { checksum: proposed.job.confirmationChecksum! }),
    ).rejects.toBeInstanceOf(ConfirmationExpiredError);

    const failed = await getModificationJobForActor(db, owner, app.id, proposed.job.id);
    expect(failed.status).toBe("failed");
    expect(failed.failureCode).toBe("confirmation_expired");
  });

  it("only the actor who requested the change can confirm it", async () => {
    const { app, baseVersionNumber } = await setupTaskApp("wrong-actor");
    const { job } = await sendMessageAndEnqueue(app.id, "Employees should no longer be able to delete tasks.", "wrong-actor", baseVersionNumber);
    const proposed = await claimAndRun(job, RESTRICT_PERMISSION_SCRIPT);
    if (proposed.kind !== "yielded") throw new Error("unreachable");

    const { addCollaborator } = await import("../repositories/collaborators");
    await addCollaborator(db, owner, app.id, "another-editor", "editor");
    const anotherEditor = { principalId: "another-editor", roles: [] };

    await expect(
      confirmModification(db, anotherEditor, app.id, proposed.job.id, { checksum: proposed.job.confirmationChecksum! }),
    ).rejects.toThrow();
  });

  it("is idempotently replayable: confirming an already-confirmed job with the same checksum is a no-op", async () => {
    const { app, baseVersionNumber } = await setupTaskApp("replay");
    const { job } = await sendMessageAndEnqueue(app.id, "Employees should no longer be able to delete tasks.", "replay", baseVersionNumber);
    const proposed = await claimAndRun(job, RESTRICT_PERMISSION_SCRIPT);
    if (proposed.kind !== "yielded") throw new Error("unreachable");

    const checksum = proposed.job.confirmationChecksum!;
    const first = await confirmModification(db, owner, app.id, proposed.job.id, { checksum });
    const second = await confirmModification(db, owner, app.id, proposed.job.id, { checksum });
    expect(second.id).toBe(first.id);
    expect(second.confirmationConfirmedAt).toEqual(first.confirmationConfirmedAt);
  });
});

describe("runModificationJob — stale base version (concurrent editor)", () => {
  it("fails safely when the spec was edited concurrently before confirmation, never silently overwriting the newer edit", async () => {
    const { app, baseVersionNumber } = await setupTaskApp("stale");
    const { job } = await sendMessageAndEnqueue(app.id, "Employees should no longer be able to delete tasks.", "stale", baseVersionNumber);
    const proposed = await claimAndRun(job, RESTRICT_PERMISSION_SCRIPT);
    if (proposed.kind !== "yielded") throw new Error("unreachable");

    // A different concurrent edit lands on the app while the destructive
    // proposal is awaiting confirmation.
    await applyOperation(db, owner, app.id, {
      operation: { opVersion: "1.0.0", type: "CREATE_ENTITY", entity: { id: "note", machineName: "note", name: "Note" } },
      baseVersionNumber,
      idempotencyKey: "concurrent-edit",
    });

    await expect(
      confirmModification(db, owner, app.id, proposed.job.id, { checksum: proposed.job.confirmationChecksum! }),
    ).rejects.toBeInstanceOf(StaleVersionError);

    const failed = await getModificationJobForActor(db, owner, app.id, proposed.job.id);
    expect(failed.status).toBe("failed");
    expect(failed.failureCode).toBe("stale_base_version");

    // The concurrent editor's work is preserved, untouched.
    const [spec] = await db.select().from(specifications).where(eq(specifications.appId, app.id));
    expect(spec.currentVersionNumber).toBe(baseVersionNumber + 1);
  });
});

describe("runModificationJob — cancellation", () => {
  it("stops at the next checkpoint once cancellation is requested", async () => {
    const { app, baseVersionNumber } = await setupTaskApp("cancel");
    const { job } = await sendMessageAndEnqueue(app.id, "Add a priority field.", "cancel", baseVersionNumber);
    await transitionStatus(db, job.id, "queued", "interpreting");
    await requestCancellation(db, owner, app.id, job.id);

    const claimed = await claimJobById(db, job.id, "test-worker-cancel", 120_000);
    const outcome = await runModificationJob(
      { db, provider: createFakeProvider(ADD_PRIORITY_FIELD_SCRIPT), workerId: "test-worker-cancel", leaseDurationMs: 120_000, signal: new AbortController().signal },
      claimed!,
    );
    expect(outcome.kind).toBe("yielded");
    if (outcome.kind !== "yielded") throw new Error("unreachable");
    expect(outcome.job.status).toBe("cancelled");
  });
});

describe("runModificationJob — worker crash recovery", () => {
  it("a job whose lease expired mid-processing is reclaimable via the stale-lease sweep", async () => {
    const { app, baseVersionNumber } = await setupTaskApp("recovery");
    const { job } = await sendMessageAndEnqueue(app.id, "Add a priority field.", "recovery", baseVersionNumber);

    const claimed = await claimJobById(db, job.id, "crashed-worker", 100); // 100ms lease
    expect(claimed).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 150)); // let the lease expire — simulates a crash, no heartbeat sent

    const reclaimed = await claimNextAvailableJob(db, "recovery-worker", 120_000);
    expect(reclaimed).not.toBeNull();
    expect(reclaimed!.id).toBe(job.id);
    expect(reclaimed!.leaseOwner).toBe("recovery-worker");

    const outcome = await runModificationJob(
      { db, provider: createFakeProvider(ADD_PRIORITY_FIELD_SCRIPT), workerId: "recovery-worker", leaseDurationMs: 120_000, signal: new AbortController().signal },
      reclaimed!,
    );
    expect(outcome.kind).toBe("yielded");
    if (outcome.kind !== "yielded") throw new Error("unreachable");
    expect(outcome.job.status).toBe("ready");
  });

  it("never claims a job awaiting human confirmation via the sweep", async () => {
    const { app, baseVersionNumber } = await setupTaskApp("no-sweep");
    const { job } = await sendMessageAndEnqueue(app.id, "Employees should no longer be able to delete tasks.", "no-sweep", baseVersionNumber);
    const proposed = await claimAndRun(job, RESTRICT_PERMISSION_SCRIPT);
    if (proposed.kind !== "yielded") throw new Error("unreachable");
    expect(proposed.job.status).toBe("awaiting_confirmation");

    const swept = await claimNextAvailableJob(db, "sweeper", 100);
    expect(swept).toBeNull();
  });
});

describe("cross-owner isolation on modification jobs", () => {
  it("denies an unrelated actor access to another owner's modification job (NotFoundError)", async () => {
    const { app, baseVersionNumber } = await setupTaskApp("isolation");
    const { job } = await sendMessageAndEnqueue(app.id, "Add a priority field.", "isolation", baseVersionNumber);
    await expect(getModificationJobForActor(db, unrelated, app.id, job.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
