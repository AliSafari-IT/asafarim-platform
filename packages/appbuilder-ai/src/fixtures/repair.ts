import { value, errorStep, type FakeProviderScript } from "../providers/fake";
import { ProviderError } from "../provider/errors";

/**
 * M10 bounded-repair fixtures — the deterministic scripts behind
 * `APPBUILDER_AI_PROVIDER=fake`'s repair routing (see
 * providers/defaultFake.ts#selectRepairScriptForPrompt). These assume the
 * same minimal `task`-entity shape the M08 modification fixtures assume
 * (see fixtures/modification.ts's docstring), plus a `team_member` entity
 * for the permission-gap scenario — directly modeled on the real bug M10
 * itself was scoped to catch (see the M09 followup fix: a role with no
 * `read` permission entry for an entity it needs to display).
 */

/**
 * The exact class of bug this milestone exists to catch: a role has no
 * `read` permission entry for an entity a page/relation needs — a
 * non-destructive SET_PERMISSION(effect: allow) closes the gap. Used as the
 * "successful validation after a safe repair" golden path — no confirmation
 * required, applies immediately.
 */
export const REPAIR_ADD_MISSING_PERMISSION_SCRIPT: FakeProviderScript = {
  proposeRepair: [
    value({
      summary: "Grants employee_role read access to team_member so the Team page and assignee lookups resolve.",
      repairable: true,
      batch: {
        reasoningSummary: "Adds a missing allow permission; does not widen any existing grant.",
        isFinalBatch: true,
        operations: [
          {
            modelBelievesDestructive: false,
            operation: {
              opVersion: "1.0.0",
              type: "SET_PERMISSION",
              permission: {
                id: "perm_employee_team_member_read_repair",
                roleId: "employee_role",
                entityId: "team_member",
                verb: "read",
                effect: "allow",
              },
            },
          },
        ],
      },
    }),
  ],
};

/**
 * A repair that narrows an existing permission to close a security-policy
 * gate failure (e.g. an over-broad delete grant) — `classifyDestructiveChange`
 * classifies this `permission_reduced`, so the repair pipeline must pause at
 * `awaiting_confirmation` exactly like a destructive modification proposal,
 * never auto-apply it. The "destructive repair confirmation" Playwright
 * fixture.
 */
export const REPAIR_NARROW_PERMISSION_SCRIPT: FakeProviderScript = {
  proposeRepair: [
    value({
      summary: "Removes employee_role's ability to delete tasks to satisfy the security-policy gate.",
      repairable: true,
      batch: {
        reasoningSummary: "Narrows employee_role's task:delete permission from allow to deny.",
        isFinalBatch: true,
        operations: [
          {
            modelBelievesDestructive: true,
            operation: {
              opVersion: "1.0.0",
              type: "SET_PERMISSION",
              permission: {
                id: "perm_employee_task_delete_repair",
                roleId: "employee_role",
                entityId: "task",
                verb: "delete",
                effect: "deny",
              },
            },
          },
        ],
      },
    }),
  ],
};

/** The failure requires a platform capability (e.g. arbitrary SQL, a new infrastructure integration) that is out of scope entirely — the model honestly reports it cannot fix this within the allowlist. */
export const REPAIR_UNSUPPORTED_CAPABILITY_SCRIPT: FakeProviderScript = {
  proposeRepair: [
    value({
      summary: "This failure requires a capability (custom SQL/infrastructure change) outside the allowlisted operation set and cannot be safely repaired here.",
      repairable: false,
      batch: { reasoningSummary: "No allowlisted operation can address this failure.", isFinalBatch: true, operations: [] },
    }),
  ],
};

/** Generic fallback when no specific scenario keyword matches. */
export const REPAIR_GENERIC_FALLBACK_SCRIPT: FakeProviderScript = {
  proposeRepair: [
    value({
      summary: "Unable to determine a safe, bounded fix for this failure from the diagnostics provided.",
      repairable: false,
      batch: { reasoningSummary: "Diagnostics insufficient to propose a safe fix.", isFinalBatch: true, operations: [] },
    }),
  ],
};

/** Response body missing required fields. */
export const REPAIR_MALFORMED_RESPONSE_SCRIPT: FakeProviderScript = {
  proposeRepair: [value({ summary: "" })],
};

/** First call times out, second (retried) call succeeds with the missing-permission fix. */
export const REPAIR_TIMEOUT_THEN_RETRY_SCRIPT: FakeProviderScript = {
  proposeRepair: [
    errorStep(new ProviderError({ code: "timeout", message: "Simulated provider timeout." })),
    ...(REPAIR_ADD_MISSING_PERMISSION_SCRIPT.proposeRepair ?? []),
  ],
};

/** Model attempts an operation outside the allowlisted Operation union — fails schema validation, never reaches applyOperation. */
export const REPAIR_FORBIDDEN_OPERATION_SCRIPT: FakeProviderScript = {
  proposeRepair: [
    value({
      summary: "Runs a setup script.",
      repairable: true,
      batch: {
        reasoningSummary: "Adds a setup step.",
        isFinalBatch: true,
        operations: [
          { modelBelievesDestructive: false, operation: { opVersion: "1.0.0", type: "EXECUTE_SHELL_COMMAND", command: "rm -rf /" } },
        ],
      },
    }),
  ],
};
