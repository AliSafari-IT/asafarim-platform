import { and, asc, eq } from "drizzle-orm";
import type { OperationBatchType } from "@asafarim/appbuilder-ai";
import type { Db } from "../db/client";
import { modificationJobs, modificationPlanSteps, modificationPlans, specifications } from "../db/schema";
import { generateId } from "../db/ids";
import { checksumOf } from "../db/hash";
import { NotFoundError } from "../errors";
import type { PersistedStepRequest } from "../modification/types";

export type ModificationPlanRow = typeof modificationPlans.$inferSelect;
export type ModificationPlanStepRow = typeof modificationPlanSteps.$inferSelect;

/**
 * M13 slice E — multi-step modification plans (docs/appbuilder-m13-
 * multimodal-contextual-assistant.md, "`modification_plans` and
 * `modification_plan_steps`"). Every step is executed by an ordinary
 * `modification_jobs` row going through the UNCHANGED single-step pipeline
 * (lib/modification/pipeline.ts) — this module only owns the plan/step
 * bookkeeping around that, never a second mutation executor.
 */

export interface CreateModificationPlanInput {
  appId: string;
  conversationId: string;
  triggeringMessageId: string;
  baseVersionNumber: number;
  summary: string;
  capabilityAssessment: Record<string, unknown>;
  steps: { title: string; batch: OperationBatchType }[];
  /** The job already executing step 1 — bound atomically so step 1 is never left with a null modificationJobId. */
  firstStepJobId: string;
}

/** Creates a plan and all of its steps in one transaction, with step 1 immediately bound to the job that is about to execute it. */
export async function createModificationPlan(
  db: Db,
  input: CreateModificationPlanInput,
): Promise<{ plan: ModificationPlanRow; steps: ModificationPlanStepRow[] }> {
  return db.transaction(async (tx) => {
    const [plan] = await tx
      .insert(modificationPlans)
      .values({
        id: generateId(),
        appId: input.appId,
        conversationId: input.conversationId,
        triggeringMessageId: input.triggeringMessageId,
        status: "running",
        baseVersionNumber: input.baseVersionNumber,
        summary: input.summary,
        capabilityAssessment: input.capabilityAssessment,
      })
      .returning();

    const steps: ModificationPlanStepRow[] = [];
    for (let index = 0; index < input.steps.length; index += 1) {
      const stepNumber = index + 1;
      const [row] = await tx
        .insert(modificationPlanSteps)
        .values({
          id: generateId(),
          planId: plan.id,
          appId: input.appId,
          stepNumber,
          title: input.steps[index].title,
          operationBatch: input.steps[index].batch as unknown as Record<string, unknown>,
          status: stepNumber === 1 ? "running" : "pending",
          modificationJobId: stepNumber === 1 ? input.firstStepJobId : null,
        })
        .returning();
      steps.push(row);
    }

    return { plan, steps };
  });
}

export async function getPlanStepById(db: Db, stepId: string): Promise<ModificationPlanStepRow | null> {
  const [row] = await db.select().from(modificationPlanSteps).where(eq(modificationPlanSteps.id, stepId)).limit(1);
  return row ?? null;
}

export async function getPlanById(db: Db, planId: string): Promise<ModificationPlanRow | null> {
  const [row] = await db.select().from(modificationPlans).where(eq(modificationPlans.id, planId)).limit(1);
  return row ?? null;
}

export async function getPlanSteps(db: Db, planId: string): Promise<ModificationPlanStepRow[]> {
  return db.select().from(modificationPlanSteps).where(eq(modificationPlanSteps.planId, planId)).orderBy(asc(modificationPlanSteps.stepNumber));
}

export type AdvancePlanResult =
  | { kind: "completed" }
  | { kind: "advanced"; nextJob: typeof modificationJobs.$inferSelect; nextStepTitle: string; nextStepNumber: number };

/**
 * Marks `step` applied and either completes the plan (nothing left to run)
 * or creates the next step's job — bypassing `queued`/`interpreting`
 * entirely, since the operation batch for every step was already decided
 * by the single decision call that created the plan (M13/M08: a
 * conversational modification never re-plans iteratively). The new job
 * re-reads the app's CURRENT specification version as its base, so a step
 * that runs minutes after the plan was created still gets real stale-
 * version protection from the unchanged applying phase, exactly like any
 * other modification job.
 */
export async function advanceToNextStep(
  db: Db,
  currentJob: typeof modificationJobs.$inferSelect,
  step: ModificationPlanStepRow,
): Promise<AdvancePlanResult> {
  return db.transaction(async (tx) => {
    await tx
      .update(modificationPlanSteps)
      .set({ status: "applied", resultingVersionNumber: currentJob.resultingVersionNumber ?? undefined, updatedAt: new Date() })
      .where(eq(modificationPlanSteps.id, step.id));

    const steps = await tx
      .select()
      .from(modificationPlanSteps)
      .where(eq(modificationPlanSteps.planId, step.planId))
      .orderBy(asc(modificationPlanSteps.stepNumber));
    const next = steps.find((s) => s.stepNumber === step.stepNumber + 1);

    if (!next) {
      await tx.update(modificationPlans).set({ status: "completed", updatedAt: new Date() }).where(eq(modificationPlans.id, step.planId));
      return { kind: "completed" };
    }

    const [specRow] = await tx.select().from(specifications).where(eq(specifications.appId, currentJob.appId)).limit(1);
    if (!specRow) throw new NotFoundError("Specification for app", currentJob.appId);

    const batch = next.operationBatch as unknown as OperationBatchType;
    const persisted: PersistedStepRequest = { summary: next.title, assumptions: [], batch };
    const idempotencyKey = `${step.planId}:step${next.stepNumber}`;

    const [nextJob] = await tx
      .insert(modificationJobs)
      .values({
        id: generateId(),
        appId: currentJob.appId,
        conversationId: currentJob.conversationId,
        triggeringMessageId: currentJob.triggeringMessageId,
        initiatedByPrincipalId: currentJob.initiatedByPrincipalId,
        status: "proposing",
        phase: "proposing",
        idempotencyKey,
        requestHash: checksumOf({ planId: step.planId, stepNumber: next.stepNumber }),
        baseVersionNumber: specRow.currentVersionNumber,
        userRequestText: currentJob.userRequestText,
        normalizedRequest: persisted as unknown as Record<string, unknown>,
        planStepId: next.id,
      })
      .returning();

    await tx
      .update(modificationPlanSteps)
      .set({ modificationJobId: nextJob.id, status: "running", updatedAt: new Date() })
      .where(eq(modificationPlanSteps.id, next.id));
    await tx.update(modificationPlans).set({ status: "running", updatedAt: new Date() }).where(eq(modificationPlans.id, step.planId));

    return { kind: "advanced", nextJob, nextStepTitle: next.title, nextStepNumber: next.stepNumber };
  });
}

/**
 * Called when a step's job ends `failed`/`cancelled`. Leaves every already-
 * `applied` step (and its version) untouched — a recoverable partial
 * result, never a rollback — marks the current step and every remaining
 * `pending` step `skipped`/`failed`, and the plan `failed`.
 */
export async function stopPlanOnStepEnd(
  db: Db,
  step: ModificationPlanStepRow,
  outcome: "failed" | "cancelled",
  failureCode: string | null,
  failureMessage: string | null,
): Promise<ModificationPlanStepRow[]> {
  return db.transaction(async (tx) => {
    await tx
      .update(modificationPlanSteps)
      .set({
        status: outcome === "cancelled" ? "skipped" : "failed",
        failureCode: failureCode as ModificationPlanStepRow["failureCode"],
        failureMessage,
        updatedAt: new Date(),
      })
      .where(eq(modificationPlanSteps.id, step.id));

    await tx
      .update(modificationPlanSteps)
      .set({ status: "skipped", updatedAt: new Date() })
      .where(and(eq(modificationPlanSteps.planId, step.planId), eq(modificationPlanSteps.status, "pending")));

    await tx
      .update(modificationPlans)
      .set({ status: outcome === "cancelled" ? "cancelled" : "failed", updatedAt: new Date() })
      .where(eq(modificationPlans.id, step.planId));

    return tx.select().from(modificationPlanSteps).where(eq(modificationPlanSteps.planId, step.planId)).orderBy(asc(modificationPlanSteps.stepNumber));
  });
}
