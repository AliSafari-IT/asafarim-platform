import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createFakeProvider, value, LANDING_PAGE_BRIEF_SCRIPT, type AiProvider } from "@asafarim/appbuilder-ai";
import type { ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { createApp } from "../repositories/apps";
import { applyOperation } from "../repositories/operations";
import { appendUserMessage } from "../repositories/conversations";
import {
  claimJobById,
  confirmModification,
  enqueueModificationJob,
  requestCancellation,
  type ModificationJobRow,
} from "../repositories/modificationJobs";
import { getPlanById, getPlanSteps } from "../repositories/modificationPlans";
import { modificationPlanSteps, specifications, specificationVersions } from "../db/schema";
import { runModificationJob } from "./pipeline";

/**
 * M13 slice E, end to end: a single decision spanning several bounded
 * steps (docs/appbuilder-m13-multimodal-contextual-assistant.md, "Large
 * requests") is executed as a real `modification_plans` row whose steps are
 * ordinary `modification_jobs` chained through the UNCHANGED single-step
 * pipeline — proving per-step dry-run/validate/version/preview, destructive
 * confirmation, and failure recovery all still apply per step, without a
 * second mutation executor.
 */

const db = getTestDb();
const owner = { principalId: "plan-owner", roles: [] };

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

async function setupApp(suffix: string) {
  const app = await createApp(
    db,
    owner,
    { name: `Plan App ${suffix}`, slug: `plan-${suffix}-${Math.random().toString(36).slice(2, 8)}` },
    `plan-create-${suffix}`,
  );
  return { app };
}

async function sendAndClaim(appId: string, baseVersionNumber: number, request: string, suffix: string): Promise<ModificationJobRow> {
  const { message } = await appendUserMessage(db, owner, appId, { content: request, selectionContext: null, baseVersionNumber });
  const job = await enqueueModificationJob(db, owner, appId, {
    conversationId: message.conversationId,
    triggeringMessageId: message.id,
    userRequestText: request,
    selectionContext: null,
    idempotencyKey: `plan-job-${suffix}`,
  });
  const claimed = await claimJobById(db, job.id, "plan-worker", 120_000);
  if (!claimed) throw new Error("expected to claim the freshly-enqueued job");
  return claimed;
}

async function drive(job: ModificationJobRow, provider: AiProvider) {
  const outcome = await runModificationJob(
    { db, provider, workerId: "plan-worker", leaseDurationMs: 120_000, signal: new AbortController().signal },
    job,
  );
  if (outcome.kind !== "yielded") throw new Error(`expected a terminal outcome, got ${outcome.kind}`);
  return outcome.job as ModificationJobRow;
}

/** Claims and drives whatever job a plan step currently points at (no queue/Redis involved — same DB-is-truth model the worker itself uses). */
async function driveStepJob(jobId: string, provider: AiProvider) {
  const claimed = await claimJobById(db, jobId, "plan-worker", 120_000);
  if (!claimed) throw new Error(`expected to claim step job ${jobId}`);
  return drive(claimed, provider);
}

async function specAt(appId: string, versionNumber: number): Promise<ApplicationSpecificationType> {
  const [spec] = await db.select().from(specifications).where(eq(specifications.appId, appId));
  const rows = await db.select().from(specificationVersions).where(eq(specificationVersions.specificationId, spec.id));
  return rows.find((row) => row.versionNumber === versionNumber)!.payload as unknown as ApplicationSpecificationType;
}

describe("multi-step plan: landing-page brief", () => {
  it("stages structure/branding into separate steps and honestly discloses what it cannot represent", async () => {
    const { app } = await setupApp("landing");

    const job1 = await sendAndClaim(
      app.id,
      1,
      "Build a full landing page for an AI engineer: hero section with headline and CTA, an about section, a projects showcase pulling from GitHub, a contact form, our brand colors, and smooth Framer Motion animations throughout.",
      "landing",
    );
    const provider = createFakeProvider(LANDING_PAGE_BRIEF_SCRIPT);
    const afterStep1 = await drive(job1, provider);

    expect(afterStep1.status).toBe("ready");
    expect(afterStep1.planStepId).not.toBeNull();

    const plan = await getPlanById(db, (await requirePlanIdForJob(afterStep1)) ?? "");
    expect(plan).not.toBeNull();
    expect(plan!.status).toBe("running");

    const steps = await getPlanSteps(db, plan!.id);
    expect(steps).toHaveLength(3);
    expect(steps[0].status).toBe("applied");
    expect(steps[1].status).toBe("running");
    expect(steps[2].status).toBe("pending");
    expect(steps[1].modificationJobId).not.toBeNull();

    const afterStep2 = await driveStepJob(steps[1].modificationJobId!, provider);
    expect(afterStep2.status).toBe("ready");

    const stepsAfter2 = await getPlanSteps(db, plan!.id);
    expect(stepsAfter2[1].status).toBe("applied");
    expect(stepsAfter2[2].status).toBe("running");
    expect(stepsAfter2[2].modificationJobId).not.toBeNull();

    const afterStep3 = await driveStepJob(stepsAfter2[2].modificationJobId!, provider);
    expect(afterStep3.status).toBe("ready");

    const finalPlan = await getPlanById(db, plan!.id);
    expect(finalPlan!.status).toBe("completed");
    const finalSteps = await getPlanSteps(db, plan!.id);
    expect(finalSteps.every((s) => s.status === "applied")).toBe(true);

    // Every representable piece actually landed.
    const spec = await specAt(app.id, afterStep3.resultingVersionNumber!);
    expect(spec.pages.map((p) => p.id)).toEqual(expect.arrayContaining(["about", "projects", "contact"]));
    expect(spec.branding.primaryColor).toBe("#2563eb");

    // The honest capability gap is recorded on the plan, not silently dropped.
    const assessment = finalPlan!.capabilityAssessment as { unsupported: { classification: string }[] };
    expect(assessment.unsupported.map((g) => g.classification)).toEqual(expect.arrayContaining(["flag", "schema"]));
  });
});

/** Small helper: a job created for a plan step always has planStepId set; resolve the owning plan's id through the step row. */
async function requirePlanIdForJob(job: ModificationJobRow): Promise<string | null> {
  if (!job.planStepId) return null;
  const [row] = await db.select({ planId: modificationPlanSteps.planId }).from(modificationPlanSteps).where(eq(modificationPlanSteps.id, job.planStepId));
  return row?.planId ?? null;
}

describe("multi-step plan: destructive confirmation mid-plan", () => {
  it("pauses the SPECIFIC step for confirmation, exactly like a single-step job would", async () => {
    const { app } = await setupApp("destructive-plan");
    await applyOperation(db, owner, app.id, {
      operation: { opVersion: "1.0.0", type: "CREATE_ENTITY", entity: { id: "task", machineName: "task", name: "Task" } },
      baseVersionNumber: 1,
      idempotencyKey: "destructive-plan-entity",
    });
    await applyOperation(db, owner, app.id, {
      operation: { opVersion: "1.0.0", type: "CREATE_ROLE", role: { id: "employee_role", name: "Employee" } },
      baseVersionNumber: 2,
      idempotencyKey: "destructive-plan-role",
    });
    const { version } = await applyOperation(db, owner, app.id, {
      operation: {
        opVersion: "1.0.0",
        type: "SET_PERMISSION",
        permission: { id: "perm_employee_task_delete", roleId: "employee_role", entityId: "task", verb: "delete", effect: "allow" },
      },
      baseVersionNumber: 3,
      idempotencyKey: "destructive-plan-permission",
    });

    const twoStepScript = {
      proposeModification: [
        value({
          outcome: "ready",
          summary: "Adds a priority field, then narrows delete access.",
          assumptions: [],
          plan: [
            {
              title: "Add priority field",
              batch: {
                reasoningSummary: "Adds a field.",
                isFinalBatch: true,
                operations: [
                  {
                    modelBelievesDestructive: false,
                    operation: {
                      opVersion: "1.0.0",
                      type: "ADD_FIELD",
                      entityId: "task",
                      field: { id: "priority", machineName: "priority", name: "Priority", type: "text", required: false, unique: false, archived: false, multiple: false },
                    },
                  },
                ],
              },
            },
            {
              title: "Restrict delete to managers",
              batch: {
                reasoningSummary: "Narrows an existing allow permission to deny.",
                isFinalBatch: true,
                operations: [
                  {
                    modelBelievesDestructive: true,
                    operation: {
                      opVersion: "1.0.0",
                      type: "SET_PERMISSION",
                      permission: { id: "perm_employee_task_delete", roleId: "employee_role", entityId: "task", verb: "delete", effect: "deny" },
                    },
                  },
                ],
              },
            },
          ],
        }),
      ],
    };

    const job1 = await sendAndClaim(app.id, version!.versionNumber, "add priority then restrict delete", "destructive-plan");
    const provider = createFakeProvider(twoStepScript);
    const afterStep1 = await drive(job1, provider);
    expect(afterStep1.status).toBe("ready");

    const planId = (await requirePlanIdForJob(afterStep1))!;
    const steps = await getPlanSteps(db, planId);
    expect(steps[1].status).toBe("running");

    const step2Claimed = await claimJobById(db, steps[1].modificationJobId!, "plan-worker", 120_000);
    const outcome = await runModificationJob(
      { db, provider, workerId: "plan-worker", leaseDurationMs: 120_000, signal: new AbortController().signal },
      step2Claimed!,
    );
    expect(outcome.kind).toBe("yielded");
    const paused = (outcome as { job: ModificationJobRow }).job;
    expect(paused.status).toBe("awaiting_confirmation");
    expect(paused.confirmationChecksum).toBeTruthy();

    // The SAME confirm route/repository function a single-step job uses.
    await confirmModification(db, owner, app.id, paused.id, { checksum: paused.confirmationChecksum! });
    const reclaimed = await claimJobById(db, paused.id, "plan-worker", 120_000);
    const finished = await drive(reclaimed!, provider);
    expect(finished.status).toBe("ready");

    const finalSteps = await getPlanSteps(db, planId);
    expect(finalSteps.every((s) => s.status === "applied")).toBe(true);
    const finalPlan = await getPlanById(db, planId);
    expect(finalPlan!.status).toBe("completed");
  });
});

describe("multi-step plan: failure recovery", () => {
  it("keeps the applied step's version and marks the plan/remaining steps stopped rather than losing progress", async () => {
    const { app } = await setupApp("plan-failure");
    await applyOperation(db, owner, app.id, {
      operation: { opVersion: "1.0.0", type: "CREATE_ENTITY", entity: { id: "task", machineName: "task", name: "Task" } },
      baseVersionNumber: 1,
      idempotencyKey: "plan-failure-entity",
    });

    const threeStepScript = {
      proposeModification: [
        value({
          outcome: "ready",
          summary: "Adds a title field, then two more steps.",
          assumptions: [],
          plan: [
            {
              title: "Add title field",
              batch: {
                reasoningSummary: "Adds a field.",
                isFinalBatch: true,
                operations: [
                  {
                    modelBelievesDestructive: false,
                    operation: {
                      opVersion: "1.0.0",
                      type: "ADD_FIELD",
                      entityId: "task",
                      field: { id: "title", machineName: "title", name: "Title", type: "text", required: false, unique: false, archived: false, multiple: false },
                    },
                  },
                ],
              },
            },
            {
              title: "Add status field",
              batch: {
                reasoningSummary: "Adds another field.",
                isFinalBatch: true,
                operations: [
                  {
                    modelBelievesDestructive: false,
                    operation: {
                      opVersion: "1.0.0",
                      type: "ADD_FIELD",
                      entityId: "task",
                      field: { id: "status", machineName: "status", name: "Status", type: "text", required: false, unique: false, archived: false, multiple: false },
                    },
                  },
                ],
              },
            },
            {
              title: "Add priority field",
              batch: {
                reasoningSummary: "Adds a third field.",
                isFinalBatch: true,
                operations: [
                  {
                    modelBelievesDestructive: false,
                    operation: {
                      opVersion: "1.0.0",
                      type: "ADD_FIELD",
                      entityId: "task",
                      field: { id: "priority", machineName: "priority", name: "Priority", type: "text", required: false, unique: false, archived: false, multiple: false },
                    },
                  },
                ],
              },
            },
          ],
        }),
      ],
    };

    const job1 = await sendAndClaim(app.id, 2, "add three fields", "plan-failure");
    const provider = createFakeProvider(threeStepScript);
    const afterStep1 = await drive(job1, provider);
    expect(afterStep1.status).toBe("ready");
    const step1VersionNumber = afterStep1.resultingVersionNumber!;

    const planId = (await requirePlanIdForJob(afterStep1))!;
    const steps = await getPlanSteps(db, planId);
    expect(steps[1].status).toBe("running");
    expect(steps[2].status).toBe("pending");

    // Step 2 is cancelled before it runs — a deterministic stand-in for "a
    // later stage fails": both outcomes stop the plan without touching what
    // already landed (see lib/modification/pipeline.ts's stopPlanIfApplicable).
    await requestCancellation(db, owner, app.id, steps[1].modificationJobId!);
    const afterStep2 = await driveStepJob(steps[1].modificationJobId!, provider);
    expect(afterStep2.status).toBe("cancelled");

    const finalSteps = await getPlanSteps(db, planId);
    expect(finalSteps[0].status).toBe("applied");
    expect(finalSteps[0].resultingVersionNumber).toBe(step1VersionNumber);
    expect(finalSteps[1].status).toBe("skipped"); // the cancelled step itself
    expect(finalSteps[2].status).toBe("skipped"); // never-started step 3

    const finalPlan = await getPlanById(db, planId);
    expect(finalPlan!.status).toBe("cancelled");

    // Step 1's change was never rolled back or replaced.
    const [spec] = await db.select().from(specifications).where(eq(specifications.appId, app.id));
    expect(spec.currentVersionNumber).toBe(step1VersionNumber);
    const payload = await specAt(app.id, step1VersionNumber);
    const taskEntity = payload.entities.find((e) => e.id === "task");
    expect(taskEntity?.fields.some((f) => f.id === "title")).toBe(true);
    expect(taskEntity?.fields.some((f) => f.id === "status")).toBe(false);
    expect(taskEntity?.fields.some((f) => f.id === "priority")).toBe(false);
  });
});
