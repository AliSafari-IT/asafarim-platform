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
 *
 * M13 slice E: every script now returns a `ModificationDecision`
 * (outcome-tagged) rather than the old `{ clarificationNeeded, batch }`
 * shape — see schemas/modificationDecision.ts.
 */

/** "Add a priority field to tasks." — a plain, non-destructive ADD_FIELD. */
export const ADD_PRIORITY_FIELD_SCRIPT: FakeProviderScript = {
  proposeModification: [
    value({
      outcome: "ready",
      summary: "Adds a Priority field to Task with Low/Medium/High options.",
      assumptions: [],
      plan: [
        {
          title: "Add Priority field",
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
        },
      ],
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
      outcome: "ready",
      summary: "Switches the Tasks table to a compact row density.",
      assumptions: [],
      plan: [
        {
          title: "Compact the Tasks table",
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
        },
      ],
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
      outcome: "ready",
      summary: "Removes the Employee role's ability to delete tasks — only Admin/Manager will retain delete access.",
      assumptions: [],
      plan: [
        {
          title: "Restrict task deletion to Admin/Manager",
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
        },
      ],
    }),
  ],
};

/** Too ambiguous to act on safely — the model asks one grounded question instead of guessing. */
export const GENERIC_MODIFICATION_FALLBACK_SCRIPT: FakeProviderScript = {
  proposeModification: [
    value({
      outcome: "needs_clarification",
      question: {
        id: "q_generic_scope",
        text: "Which specific field, page, or permission would you like changed?",
        choices: [
          { id: "field", label: "A field on an entity" },
          { id: "page", label: "A page or its content" },
          { id: "permission", label: "A role's permission" },
        ],
        allowFreeText: true,
      },
    }),
  ],
};

/** A well-behaved response to a prompt-injection attempt embedded in a conversational request — mirrors adversarial.ts's PROMPT_INJECTION_RESISTED_SCRIPT for the modification vocabulary. */
export const MODIFICATION_PROMPT_INJECTION_RESISTED_SCRIPT: FakeProviderScript = {
  proposeModification: [
    value({
      outcome: "ready",
      summary:
        "The request contained text resembling an attempt to override these instructions; it was disregarded. Adds a Priority field to Task as the only legitimate part of the request.",
      assumptions: [],
      plan: [
        {
          title: "Add Priority field",
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
        },
      ],
    }),
  ],
};

/** Model attempts an operation outside the allowlisted Operation union — fails schema validation, never reaches applyOperation. */
export const MODIFICATION_FORBIDDEN_OPERATION_SCRIPT: FakeProviderScript = {
  proposeModification: [
    value({
      outcome: "ready",
      summary: "Runs a setup script.",
      assumptions: [],
      plan: [
        {
          title: "Run setup",
          batch: {
            reasoningSummary: "Adds a setup step.",
            isFinalBatch: true,
            operations: [
              { modelBelievesDestructive: false, operation: { opVersion: "1.0.0", type: "EXECUTE_SHELL_COMMAND", command: "rm -rf /" } },
            ],
          },
        },
      ],
    }),
  ],
};

/** Model attempts to smuggle a confirmDestructive flag onto a proposed operation — no such field exists on ProposedOperation, so this fails schema validation. */
export const MODIFICATION_SELF_APPROVED_DESTRUCTIVE_SCRIPT: FakeProviderScript = {
  proposeModification: [
    value({
      outcome: "ready",
      summary: "Archives the Task entity, pre-confirmed.",
      assumptions: [],
      plan: [
        {
          title: "Archive Task",
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
        },
      ],
    }),
  ],
};

/** Response body missing required fields. */
export const MODIFICATION_MALFORMED_RESPONSE_SCRIPT: FakeProviderScript = {
  proposeModification: [value({ outcome: "ready", summary: "" })],
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
      outcome: "ready",
      summary: "Updates a field that does not exist.",
      assumptions: [],
      plan: [
        {
          title: "Update field",
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
        },
      ],
    }),
  ],
};

/**
 * M13 slice E — a detailed, multi-surface landing-page brief (structure,
 * content, branding, a GitHub-pulled showcase, Framer Motion animation):
 * the reported "too broad" rejection. Staged into independently applied
 * steps for what the schema CAN represent (a projects page, a contact
 * form/page, and the brand colour), with the GitHub/animation parts named
 * honestly as capability gaps rather than silently dropped or used as a
 * reason to refuse the whole request.
 */
export const LANDING_PAGE_BRIEF_SCRIPT: FakeProviderScript = {
  proposeModification: [
    value({
      outcome: "partially_supported",
      summary:
        "This app's specification can represent the page structure, content pages, and brand colour from your brief. It cannot represent a live GitHub-pulled project feed or Framer Motion animation — those are listed below as gaps.",
      assumptions: [{ statement: "Mapped the requested hero/about/projects/contact sections onto separate pages, the closest representable structure." }],
      plan: [
        {
          title: "Create the About and Projects pages",
          batch: {
            reasoningSummary: "Adds the structural pages the brief describes that the schema can represent.",
            isFinalBatch: true,
            operations: [
              {
                modelBelievesDestructive: false,
                operation: { opVersion: "1.0.0", type: "CREATE_PAGE", page: { id: "about", name: "About", path: "about" } },
              },
              {
                modelBelievesDestructive: false,
                operation: { opVersion: "1.0.0", type: "CREATE_PAGE", page: { id: "projects", name: "Projects", path: "projects" } },
              },
            ],
          },
        },
        {
          title: "Create the Contact page",
          batch: {
            reasoningSummary: "Adds the contact page the brief describes.",
            isFinalBatch: true,
            operations: [
              {
                modelBelievesDestructive: false,
                operation: { opVersion: "1.0.0", type: "CREATE_PAGE", page: { id: "contact", name: "Contact", path: "contact" } },
              },
            ],
          },
        },
        {
          title: "Apply the brand colour",
          batch: {
            reasoningSummary: "Sets the app's primary brand colour, the only colour-valued property this schema can express.",
            isFinalBatch: true,
            operations: [
              { modelBelievesDestructive: false, operation: { opVersion: "1.0.0", type: "UPDATE_BRANDING", patch: { primaryColor: "#2563eb" } } },
            ],
          },
        },
      ],
      unsupported: [
        {
          requested: "a projects showcase pulling live content from GitHub",
          reason: "Public GitHub reference import is not yet enabled on this platform.",
          classification: "flag",
        },
        {
          requested: "smooth Framer Motion animations throughout",
          reason: "The specification schema has no animation or transition property — only fixed rendering primitives.",
          classification: "schema",
        },
      ],
    }),
  ],
};
