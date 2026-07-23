import { and, eq } from "drizzle-orm";
import type { ApplicationSpecificationType, WorkflowType } from "@asafarim/appbuilder-schema";
import type { Db } from "../db/client";
import { generatedWorkflowExecutions, generatedWorkflowStepExecutions, generatedRecords, generatedNotifications } from "../db/schema";
import type { Actor } from "../auth/actor";
import { generateId } from "../db/ids";
import { checksumOf } from "../db/hash";
import { recordActivity } from "./activity";

/**
 * Allowlisted workflow execution — every step kind is a bounded, pre-defined
 * primitive (see @asafarim/appbuilder-schema's WORKFLOW_STEP_KINDS); there
 * is no arbitrary JavaScript, HTTP call, shell command, or free-form
 * expression anywhere in this module.
 *
 * Runs SYNCHRONOUSLY, inside the SAME transaction as the record mutation
 * that triggered it (see records.ts) — not through an async worker/queue
 * like M07/M08's AI jobs. Every allowlisted step is a fast, bounded DB
 * write, so there is no throughput reason to defer this to a queue; doing
 * it in-request also means a workflow's side effects (activity,
 * notification, field update) are visible to the SAME response that
 * triggered them, with no polling needed. A per-workflow try/catch (see
 * `runWorkflow`) ensures a failing workflow can never roll back the
 * record mutation itself — only the workflow's own partial effects are
 * discarded (via the transaction only committing on success up to the
 * point of failure being caught, not by the outer record-mutation code
 * ever seeing the exception).
 *
 * Idempotency: `generatedWorkflowExecutions` has a UNIQUE
 * `(appId, idempotencyKey)` index, where the key is deterministically
 * derived from `(workflowId, triggerRecordId, triggerRevision, triggerKind)`
 * — so retrying the SAME record mutation (same resulting revision) can
 * never re-run, and therefore never re-notify or re-activity-log, a
 * workflow that already executed for that exact trigger event.
 */

const MAX_STEPS_PER_WORKFLOW = 20;
const MAX_WORKFLOW_CHAIN_DEPTH = 5;

export interface TriggerableRecord {
  id: string;
  revision: number;
  createdByPrincipalId: string;
  data: Record<string, unknown>;
}

function computeIdempotencyKey(workflowId: string, recordId: string, revision: number, triggerKind: string): string {
  return checksumOf({ workflowId, recordId, revision, triggerKind });
}

/** Entry point called by records.ts after a record mutation commits its own changes (but within the same transaction). Never throws — a workflow failure is recorded, never propagated. */
export async function triggerWorkflows(
  tx: Db,
  actor: Actor,
  appId: string,
  spec: ApplicationSpecificationType,
  entityId: string,
  record: TriggerableRecord,
  triggerKind: "onCreate" | "onUpdate" | "onArchive",
): Promise<void> {
  const workflows = spec.workflows.filter(
    (w) => !w.archived && w.trigger.kind === triggerKind && (!w.trigger.entityId || w.trigger.entityId === entityId),
  );
  const visited = new Set<string>();
  for (const workflow of workflows) {
    await runWorkflow(tx, actor, appId, spec, entityId, record, workflow, triggerKind, visited, 0);
  }
}

async function runWorkflow(
  tx: Db,
  actor: Actor,
  appId: string,
  spec: ApplicationSpecificationType,
  entityId: string,
  record: TriggerableRecord,
  workflow: WorkflowType,
  triggerKind: string,
  visited: Set<string>,
  depth: number,
): Promise<void> {
  if (depth >= MAX_WORKFLOW_CHAIN_DEPTH || visited.has(workflow.id)) return; // cycle/depth-safe: silently stop chaining, never an error the user sees
  visited.add(workflow.id);

  const idempotencyKey = computeIdempotencyKey(workflow.id, record.id, record.revision, triggerKind);
  const [existing] = await tx
    .select()
    .from(generatedWorkflowExecutions)
    .where(and(eq(generatedWorkflowExecutions.appId, appId), eq(generatedWorkflowExecutions.idempotencyKey, idempotencyKey)))
    .limit(1);
  if (existing) return;

  const [execution] = await tx
    .insert(generatedWorkflowExecutions)
    .values({
      id: generateId(),
      appId,
      workflowId: workflow.id,
      triggerRecordId: record.id,
      triggerRevision: record.revision,
      triggerKind,
      status: "succeeded",
      idempotencyKey,
    })
    .returning();

  try {
    let currentData = record.data;
    for (const step of workflow.steps.slice(0, MAX_STEPS_PER_WORKFLOW)) {
      const outcome = await runStep(tx, actor, appId, spec, entityId, { ...record, data: currentData }, step, execution.id, visited, depth);
      if (outcome.updatedData) currentData = outcome.updatedData;
      if (outcome.stop) break;
    }
    await tx
      .update(generatedWorkflowExecutions)
      .set({ status: "succeeded", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(generatedWorkflowExecutions.id, execution.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Workflow step failed.";
    await tx
      .update(generatedWorkflowExecutions)
      .set({ status: "failed", failureMessage: message.slice(0, 500), completedAt: new Date(), updatedAt: new Date() })
      .where(eq(generatedWorkflowExecutions.id, execution.id));
    await recordActivity(tx, {
      appId,
      entityId,
      recordId: record.id,
      action: "workflow.failed",
      actorPrincipalId: actor.principalId,
      actorKind: "workflow",
      metadata: { workflowId: workflow.id, message },
    });
  }
}

interface StepOutcome {
  stop?: boolean;
  updatedData?: Record<string, unknown>;
}

async function runStep(
  tx: Db,
  actor: Actor,
  appId: string,
  spec: ApplicationSpecificationType,
  entityId: string,
  record: TriggerableRecord,
  step: WorkflowType["steps"][number],
  executionId: string,
  visited: Set<string>,
  depth: number,
): Promise<StepOutcome> {
  const [existingStep] = await tx
    .select()
    .from(generatedWorkflowStepExecutions)
    .where(and(eq(generatedWorkflowStepExecutions.executionId, executionId), eq(generatedWorkflowStepExecutions.stepId, step.id)))
    .limit(1);
  if (existingStep) return {};

  let outcome: StepOutcome = {};
  let resultMetadata: Record<string, unknown> = {};

  switch (step.kind) {
    case "updateField": {
      const config = step.config as { fieldId?: string; value?: unknown };
      const fieldId = config.fieldId;
      const entity = spec.entities.find((e) => e.id === entityId);
      // A step may only ever touch a field the entity ITSELF defines
      // (checked below) — that alone is the real guard, since such a write
      // only ever lands in the record's `data` JSONB column, never the row's
      // actual id/status/revision/etc. columns (those are always set by
      // records.ts, never derived from `data`). An earlier, additional
      // `!PROTECTED_SYSTEM_FIELD_NAMES.has(fieldId)` check here rejected any
      // field merely NAMED like a protected column — which silently no-opped
      // this exact workflow (and the template's own "Mark Complete" action,
      // via the identical bug in the `runAction` branch below) whenever the
      // targeted field was an entity's own, perfectly ordinary "status"
      // field, since "status" is also a PROTECTED_SYSTEM_FIELD_NAMES entry.
      // See validateRecordData's identical fix in validation.ts.
      if (fieldId && entity?.fields.some((f) => f.id === fieldId && !f.archived)) {
        const nextData = { ...record.data, [fieldId]: config.value };
        await tx
          .update(generatedRecords)
          .set({ data: nextData, revision: record.revision + 1, updatedAt: new Date() })
          .where(and(eq(generatedRecords.id, record.id), eq(generatedRecords.revision, record.revision)));
        outcome = { updatedData: nextData };
        resultMetadata = { fieldId, value: config.value };
      }
      break;
    }
    case "sendNotification": {
      const config = step.config as { recipientFieldId?: string; title?: string; body?: string };
      const recipientPrincipalId =
        config.recipientFieldId === "creator" || !config.recipientFieldId
          ? record.createdByPrincipalId
          : typeof record.data[config.recipientFieldId] === "string"
            ? (record.data[config.recipientFieldId] as string)
            : null;
      if (recipientPrincipalId) {
        await tx.insert(generatedNotifications).values({
          id: generateId(),
          appId,
          recipientPrincipalId,
          title: (config.title ?? "Notification").slice(0, 200),
          body: (config.body ?? "").slice(0, 2000),
          relatedRecordId: record.id,
        });
        resultMetadata = { recipientPrincipalId };
      }
      break;
    }
    case "runAction": {
      const config = step.config as { actionId?: string };
      const action = spec.actions.find((a) => a.id === config.actionId && !a.archived);
      if (action?.kind === "updateRecord") {
        const set = (action.config as { set?: Record<string, unknown> }).set ?? {};
        // Same fix as the `updateField` step above: only ever write keys the
        // entity itself defines as real fields — e.g. the task_management
        // template's own built-in "Mark Complete" action
        // (`{ set: { status: "done" } }` — see taskManagement.ts) would
        // otherwise always be silently dropped, since "status" also
        // happens to be a PROTECTED_SYSTEM_FIELD_NAMES entry.
        const entity = spec.entities.find((e) => e.id === entityId);
        const knownFieldIds = new Set(entity?.fields.filter((f) => !f.archived).map((f) => f.id) ?? []);
        const safeSet = Object.fromEntries(Object.entries(set).filter(([k]) => knownFieldIds.has(k)));
        const nextData = { ...record.data, ...safeSet };
        await tx
          .update(generatedRecords)
          .set({ data: nextData, revision: record.revision + 1, updatedAt: new Date() })
          .where(and(eq(generatedRecords.id, record.id), eq(generatedRecords.revision, record.revision)));
        outcome = { updatedData: nextData };
        resultMetadata = { actionId: action.id };
      } else if (action?.kind === "runWorkflow") {
        const targetWorkflowId = (action.config as { workflowId?: string }).workflowId;
        const targetWorkflow = spec.workflows.find((w) => w.id === targetWorkflowId && !w.archived);
        if (targetWorkflow) {
          await runWorkflow(tx, actor, appId, spec, entityId, record, targetWorkflow, "manual", visited, depth + 1);
        }
        resultMetadata = { chainedWorkflowId: targetWorkflowId };
      }
      break;
    }
    case "condition": {
      const config = step.config as { fieldId?: string; equals?: unknown };
      const matches = config.fieldId ? record.data[config.fieldId] === config.equals : true;
      resultMetadata = { matched: matches };
      if (!matches) outcome = { stop: true };
      break;
    }
  }

  await tx.insert(generatedWorkflowStepExecutions).values({
    id: generateId(),
    executionId,
    stepId: step.id,
    status: "applied",
    resultMetadata,
  });

  return outcome;
}
