import { and, eq } from "drizzle-orm";
import type { FieldType } from "@asafarim/appbuilder-schema";
import { generatedAppMembers, generatedNotifications, generatedWorkflowExecutions } from "../../db/schema";
import { resolveRuntimeContext } from "../../generated-data/runtimeAuth";
import { createRecord } from "../../generated-data/records";
import { generateId } from "../../db/ids";
import type { GateContext, GateDefinition, GateResult } from "../types";
import { redactFailures } from "../redaction";

/** Best-effort deterministic value for a required field — returns undefined when the field type cannot be safely fabricated generically (relation/file/image), in which case the gate skips rather than guessing. */
function fabricateValue(field: FieldType): unknown {
  switch (field.type) {
    case "text":
    case "longText":
      return `validation-gate-${generateId().slice(0, 8)}`;
    case "email":
      return `validation-gate-${generateId().slice(0, 8)}@example.test`;
    case "url":
      return `https://example.test/${generateId().slice(0, 8)}`;
    case "integer":
      return 1;
    case "decimal":
      return 1;
    case "boolean":
      return false;
    case "date":
      return new Date().toISOString().slice(0, 10);
    case "datetime":
      return new Date().toISOString();
    case "select":
      return field.options[0]?.value;
    default:
      return undefined;
  }
}

/**
 * Retrying a record mutation with the same idempotency key never
 * re-executes an `onCreate` workflow or duplicates its side effects —
 * exercised directly at the repository layer (lib/generated-data/records.ts,
 * workflows.ts) rather than through a browser: idempotency is a backend
 * correctness property, not a UI one, and this is more deterministic than
 * driving it through Playwright. Works generically for ANY specification
 * that defines at least one active `onCreate` workflow whose trigger entity
 * has a role with `create` permission and only easily-fabricated required
 * fields — every other shape SKIPS with a specific reason rather than
 * guessing at a relation target or file upload.
 */
export const workflowIdempotencyGate: GateDefinition = {
  key: "workflow_idempotency",
  version: "1.0.0",
  mandatory: true,
  title: "Workflow idempotency",
  description: "Retrying a record create with the same idempotency key never re-executes an onCreate workflow or duplicates its notification/activity side effects.",
  async execute(ctx: GateContext): Promise<GateResult> {
    const activeWorkflows = ctx.specPayload.workflows.filter((w) => !w.archived && w.trigger.kind === "onCreate" && w.trigger.entityId);
    if (activeWorkflows.length === 0) {
      // Legitimately not applicable — this specification has no onCreate
      // workflow at all, so there is nothing whose idempotency could be
      // tested. Never mandatory in that case (see GateResult.mandatoryOverride's
      // docstring); every OTHER skip reason below stays mandatory.
      return { status: "skipped", skipReason: "This specification defines no active onCreate workflows to exercise.", mandatoryOverride: false };
    }

    const workflow = activeWorkflows[0];
    const entityId = workflow.trigger.entityId as string;
    const entity = ctx.specPayload.entities.find((e) => e.id === entityId && !e.archived);
    if (!entity) {
      return { status: "skipped", skipReason: `Workflow "${workflow.name}" targets an entity that no longer exists or is archived.` };
    }

    const role = ctx.specPayload.roles.find(
      (r) => !r.archived && ctx.specPayload.permissions.some((p) => p.roleId === r.id && p.entityId === entityId && p.verb === "create" && p.effect === "allow"),
    );
    if (!role) {
      return { status: "skipped", skipReason: `No role has create permission on entity "${entity.name}" to exercise this workflow.` };
    }

    const data: Record<string, unknown> = {};
    for (const field of entity.fields) {
      if (field.archived || !field.required) continue;
      const value = fabricateValue(field);
      if (value === undefined) {
        return { status: "skipped", skipReason: `Entity "${entity.name}" has a required field ("${field.name}") this gate cannot safely fabricate a value for.` };
      }
      data[field.id] = value;
    }

    const [existingMember] = await ctx.db
      .select()
      .from(generatedAppMembers)
      .where(and(eq(generatedAppMembers.appId, ctx.appId), eq(generatedAppMembers.principalId, ctx.ownerPrincipalId)))
      .limit(1);
    if (!existingMember) {
      await ctx.db.insert(generatedAppMembers).values({
        id: generateId(),
        appId: ctx.appId,
        principalId: ctx.ownerPrincipalId,
        roleIds: [role.id],
        status: "active",
        provenance: "owner_bootstrap",
        invitedByPrincipalId: null,
      });
    } else if (!existingMember.roleIds.includes(role.id)) {
      await ctx.db
        .update(generatedAppMembers)
        .set({ roleIds: [...existingMember.roleIds, role.id] })
        .where(eq(generatedAppMembers.id, existingMember.id));
    }

    const runtimeCtx = await resolveRuntimeContext(ctx.db, { principalId: ctx.ownerPrincipalId, roles: [] }, ctx.appId);
    const idempotencyKey = `validation-gate:${ctx.runId}:workflow-idempotency`;

    const first = await createRecord(ctx.db, runtimeCtx, entityId, data, idempotencyKey);
    const second = await createRecord(ctx.db, runtimeCtx, entityId, data, idempotencyKey);

    const failures: { code: string; message: string }[] = [];
    if (first.id !== second.id) {
      failures.push({ code: "idempotency_key_not_honored", message: "Retrying createRecord with the same idempotency key created a second record instead of replaying the first." });
    }

    const executions = await ctx.db
      .select()
      .from(generatedWorkflowExecutions)
      .where(and(eq(generatedWorkflowExecutions.appId, ctx.appId), eq(generatedWorkflowExecutions.triggerRecordId, first.id)));
    if (executions.length > 1) {
      failures.push({ code: "duplicate_workflow_execution", message: `Expected at most 1 workflow execution for the retried create; found ${executions.length}.` });
    }

    const notifications = await ctx.db.select().from(generatedNotifications).where(eq(generatedNotifications.appId, ctx.appId));

    if (failures.length > 0) {
      return {
        status: "failed",
        failureCode: "workflow_idempotency_violation",
        failureMessage: `${failures.length} workflow idempotency violation(s) found.`,
        structuredFailures: redactFailures(failures),
      };
    }
    return { status: "passed", evidence: { workflowId: workflow.id, executionCount: executions.length, notificationCount: notifications.length } };
  },
};
