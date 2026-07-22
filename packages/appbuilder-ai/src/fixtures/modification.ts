import { value, errorStep, type FakeProviderScript } from "../providers/fake";
import { ProviderError } from "../provider/errors";

/**
 * M08 conversational-modification fixtures — the deterministic scripts
 * behind `APPBUILDER_AI_PROVIDER=fake`'s modification routing (see
 * providers/defaultFake.ts#selectModificationScriptForPrompt). Every
 * scenario here assumes a target app whose specification already has a
 * `task` entity (fields: `title`, `status`) and a `tasks` page containing a
 * `tasks_table` dataTable component — the same minimal shape tests build
 * via direct `applyOperation` calls (mirroring
 * apps/appbuilder/lib/repositories/specificationEngine.integration.test.ts's
 * own `makeApp()` convention), not necessarily the full
 * @asafarim/appbuilder-runtime task_management template (which already
 * ships a `priority` field, so wouldn't demonstrate "add task priority").
 */

/** "Add a priority field to tasks." — a plain, non-destructive ADD_FIELD. */
export const ADD_PRIORITY_FIELD_SCRIPT: FakeProviderScript = {
  proposeModification: [
    value({
      summary: "Adds a Priority field to Task with Low/Medium/High options.",
      clarificationNeeded: false,
      batch: {
        reasoningSummary: "Adds a select-type Priority field to the Task entity.",
        isFinalBatch: true,
        operations: [
          {
            modelBelievesDestructive: false,
            operation: {
              opVersion: "1.0.0",
              type: "ADD_FIELD",
              entityId: "task",
              field: {
                id: "priority",
                machineName: "priority",
                name: "Priority",
                type: "select",
                required: false,
                unique: false,
                archived: false,
                multiple: false,
                options: [
                  { value: "low", label: "Low" },
                  { value: "medium", label: "Medium" },
                  { value: "high", label: "High" },
                ],
              },
            },
          },
        ],
      },
    }),
  ],
};

/**
 * "Make this table more compact." — scoped to the selected component only
 * (`tasks_table`). Proves the pipeline never lets the model touch anything
 * beyond the one component the user selected: this batch contains exactly
 * one UPDATE_COMPONENT operation, nothing else.
 */
export const COMPACT_TABLE_SCRIPT: FakeProviderScript = {
  proposeModification: [
    value({
      summary: "Switches the Tasks table to a compact row density.",
      clarificationNeeded: false,
      batch: {
        reasoningSummary: "Sets density=compact on the selected table component only.",
        isFinalBatch: true,
        operations: [
          {
            modelBelievesDestructive: false,
            operation: {
              opVersion: "1.0.0",
              type: "UPDATE_COMPONENT",
              pageId: "tasks",
              componentId: "tasks_table",
              patch: { config: { variant: "table", density: "compact" } },
            },
          },
        ],
      },
    }),
  ],
};

/**
 * "Only managers should see this button" / "employees should no longer be
 * able to delete tasks" — narrows an existing allow permission to deny.
 * `classifyDestructiveChange` (@asafarim/appbuilder-schema) classifies this
 * as `permission_reduced`, so the pipeline pauses at `awaiting_confirmation`
 * rather than applying it — the golden-path fixture for the destructive-
 * confirmation flow.
 */
export const RESTRICT_PERMISSION_SCRIPT: FakeProviderScript = {
  proposeModification: [
    value({
      summary: "Removes the Employee role's ability to delete tasks — only Admin/Manager will retain delete access.",
      clarificationNeeded: false,
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
                id: "perm_employee_task_delete",
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

/** Too ambiguous to act on safely — the model asks for a follow-up instead of guessing. */
export const GENERIC_MODIFICATION_FALLBACK_SCRIPT: FakeProviderScript = {
  proposeModification: [
    value({
      summary: "This request is too broad to act on safely — could you describe the specific field, page, or permission you'd like changed?",
      clarificationNeeded: true,
      batch: { reasoningSummary: "Request too ambiguous to propose a safe, bounded change.", isFinalBatch: true, operations: [] },
    }),
  ],
};

/** A well-behaved response to a prompt-injection attempt embedded in a conversational request — mirrors adversarial.ts's PROMPT_INJECTION_RESISTED_SCRIPT for the modification vocabulary. */
export const MODIFICATION_PROMPT_INJECTION_RESISTED_SCRIPT: FakeProviderScript = {
  proposeModification: [
    value({
      summary:
        "The request contained text resembling an attempt to override these instructions; it was disregarded. Adds a Priority field to Task as the only legitimate part of the request.",
      clarificationNeeded: false,
      batch: {
        reasoningSummary: "Ignored the injected instruction; proceeded with the legitimate field-add request only.",
        isFinalBatch: true,
        operations: [
          {
            modelBelievesDestructive: false,
            operation: {
              opVersion: "1.0.0",
              type: "ADD_FIELD",
              entityId: "task",
              field: {
                id: "priority",
                machineName: "priority",
                name: "Priority",
                type: "select",
                required: false,
                unique: false,
                archived: false,
                multiple: false,
                options: [
                  { value: "low", label: "Low" },
                  { value: "medium", label: "Medium" },
                  { value: "high", label: "High" },
                ],
              },
            },
          },
        ],
      },
    }),
  ],
};

/** Model attempts an operation outside the allowlisted Operation union — fails schema validation, never reaches applyOperation. */
export const MODIFICATION_FORBIDDEN_OPERATION_SCRIPT: FakeProviderScript = {
  proposeModification: [
    value({
      summary: "Runs a setup script.",
      clarificationNeeded: false,
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

/** Model attempts to smuggle a confirmDestructive flag onto a proposed operation — no such field exists on ProposedOperation, so this fails schema validation. */
export const MODIFICATION_SELF_APPROVED_DESTRUCTIVE_SCRIPT: FakeProviderScript = {
  proposeModification: [
    value({
      summary: "Archives the Task entity, pre-confirmed.",
      clarificationNeeded: false,
      batch: {
        reasoningSummary: "Archives an entity, pre-confirmed.",
        isFinalBatch: true,
        operations: [
          {
            modelBelievesDestructive: true,
            confirmDestructive: true,
            operation: { opVersion: "1.0.0", type: "ARCHIVE_ENTITY", entityId: "task" },
          },
        ],
      },
    }),
  ],
};

/** Response body missing required fields. */
export const MODIFICATION_MALFORMED_RESPONSE_SCRIPT: FakeProviderScript = {
  proposeModification: [value({ summary: "" })],
};

/** First call times out, second (retried) call succeeds. */
export const MODIFICATION_TIMEOUT_THEN_RETRY_SCRIPT: FakeProviderScript = {
  proposeModification: [
    errorStep(new ProviderError({ code: "timeout", message: "Simulated provider timeout." })),
    ...(ADD_PRIORITY_FIELD_SCRIPT.proposeModification ?? []),
  ],
};

/** Schema-valid operation that fails specification-level validation once applied (references a field that doesn't exist). */
export const MODIFICATION_VALIDATION_FAILURE_SCRIPT: FakeProviderScript = {
  proposeModification: [
    value({
      summary: "Updates a field that does not exist.",
      clarificationNeeded: false,
      batch: {
        reasoningSummary: "Updates a field that does not exist.",
        isFinalBatch: true,
        operations: [
          {
            modelBelievesDestructive: false,
            operation: { opVersion: "1.0.0", type: "UPDATE_FIELD", entityId: "task", fieldId: "does_not_exist", patch: { required: true } },
          },
        ],
      },
    }),
  ],
};
