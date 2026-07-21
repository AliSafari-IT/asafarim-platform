import type { ApplicationSpecificationType } from "./specification";
import { RESERVED_NAMES } from "./constants";
import { scanForUnsafeContent } from "./contentSafety";

export interface ValidationIssue {
  /** Path-aware, e.g. ["entities", 2, "fields", 0, "machineName"]. */
  path: (string | number)[];
  code: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
}

const DANGEROUS_CONFIG_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
  "eval",
  "exec",
  "env",
  "ENV",
  "process",
]);

/**
 * Semantic validation beyond what Zod's shape-parsing already guarantees:
 * uniqueness, reserved names, referential integrity, duplicate detection,
 * and a content-safety sweep. Called (a) standalone by callers that already
 * have a parsed spec, and (b) internally by the operation engine after
 * every transformation, so no operation can ever leave a structurally valid
 * but semantically broken specification behind.
 */
export function validateSpecification(spec: ApplicationSpecificationType): ValidationResult {
  const errors: ValidationIssue[] = [];
  const push = (path: (string | number)[], code: string, message: string) =>
    errors.push({ path, code, message });

  const entityIds = new Set<string>();
  const entityMachineNames = new Set<string>();
  const activeEntityIds = new Set<string>();
  const fieldIdsByEntity = new Map<string, Set<string>>();

  spec.entities.forEach((entity, entityIndex) => {
    const entityPath = ["entities", entityIndex];
    if (entityIds.has(entity.id)) {
      push([...entityPath, "id"], "duplicate_id", `Duplicate entity id "${entity.id}"`);
    }
    entityIds.add(entity.id);
    if (!entity.archived) activeEntityIds.add(entity.id);

    if (entityMachineNames.has(entity.machineName)) {
      push(
        [...entityPath, "machineName"],
        "duplicate_machine_name",
        `Duplicate entity machineName "${entity.machineName}"`,
      );
    }
    entityMachineNames.add(entity.machineName);
    if (RESERVED_NAMES.has(entity.machineName.toLowerCase())) {
      push(
        [...entityPath, "machineName"],
        "reserved_name",
        `"${entity.machineName}" is a reserved name and cannot be used as an entity machineName`,
      );
    }
    checkUnsafeText(entity.description, [...entityPath, "description"], push);

    const fieldIds = new Set<string>();
    const fieldMachineNames = new Set<string>();
    fieldIdsByEntity.set(entity.id, fieldIds);

    entity.fields.forEach((field, fieldIndex) => {
      const fieldPath = [...entityPath, "fields", fieldIndex];
      if (fieldIds.has(field.id)) {
        push([...fieldPath, "id"], "duplicate_id", `Duplicate field id "${field.id}" on entity "${entity.id}"`);
      }
      fieldIds.add(field.id);

      if (fieldMachineNames.has(field.machineName)) {
        push(
          [...fieldPath, "machineName"],
          "duplicate_machine_name",
          `Duplicate field machineName "${field.machineName}" on entity "${entity.id}"`,
        );
      }
      fieldMachineNames.add(field.machineName);
      if (RESERVED_NAMES.has(field.machineName.toLowerCase())) {
        push(
          [...fieldPath, "machineName"],
          "reserved_name",
          `"${field.machineName}" is a reserved name and cannot be used as a field machineName`,
        );
      }
      checkUnsafeText(field.description, [...fieldPath, "description"], push);

      if (field.type === "select") {
        const optionValues = new Set<string>();
        field.options.forEach((option, optionIndex) => {
          if (optionValues.has(option.value)) {
            push(
              [...fieldPath, "options", optionIndex, "value"],
              "duplicate_option",
              `Duplicate select option value "${option.value}" on field "${field.id}"`,
            );
          }
          optionValues.add(option.value);
        });
      }
    });

    const seenIndexKeys = new Set<string>();
    entity.indexes.forEach((index, indexIndex) => {
      const indexPath = [...entityPath, "indexes", indexIndex];
      const key = [...index.fieldIds].sort().join(",");
      if (seenIndexKeys.has(key)) {
        push([...indexPath, "fieldIds"], "duplicate_index", `Duplicate index on fields [${key}]`);
      }
      seenIndexKeys.add(key);

      index.fieldIds.forEach((fieldId, fieldIdIndex) => {
        if (!fieldIds.has(fieldId)) {
          push(
            [...indexPath, "fieldIds", fieldIdIndex],
            "orphaned_reference",
            `Index references unknown field "${fieldId}" on entity "${entity.id}"`,
          );
        }
      });
    });
  });

  // ── Relations ────────────────────────────────────────────────────────
  const relationIds = new Set<string>();
  spec.relations.forEach((relation, relationIndex) => {
    const relationPath = ["relations", relationIndex];
    if (relationIds.has(relation.id)) {
      push([...relationPath, "id"], "duplicate_id", `Duplicate relation id "${relation.id}"`);
    }
    relationIds.add(relation.id);

    if (!entityIds.has(relation.fromEntityId)) {
      push(
        [...relationPath, "fromEntityId"],
        "orphaned_reference",
        `Relation "${relation.id}" references unknown entity "${relation.fromEntityId}"`,
      );
    }
    if (!entityIds.has(relation.toEntityId)) {
      push(
        [...relationPath, "toEntityId"],
        "orphaned_reference",
        `Relation "${relation.id}" references unknown entity "${relation.toEntityId}"`,
      );
    }
  });

  // relation-typed fields must reference a real relation
  spec.entities.forEach((entity, entityIndex) => {
    entity.fields.forEach((field, fieldIndex) => {
      if (field.type === "relation" && !relationIds.has(field.relationId)) {
        push(
          ["entities", entityIndex, "fields", fieldIndex, "relationId"],
          "orphaned_reference",
          `Field "${field.id}" references unknown relation "${field.relationId}"`,
        );
      }
    });
  });

  // ── Roles & permissions ──────────────────────────────────────────────
  const roleIds = new Set<string>();
  spec.roles.forEach((role, roleIndex) => {
    const rolePath = ["roles", roleIndex];
    if (roleIds.has(role.id)) {
      push([...rolePath, "id"], "duplicate_id", `Duplicate role id "${role.id}"`);
    }
    roleIds.add(role.id);
    checkUnsafeText(role.description, [...rolePath, "description"], push);
  });

  const permissionIds = new Set<string>();
  const permissionTuples = new Set<string>();
  spec.permissions.forEach((permission, permissionIndex) => {
    const permissionPath = ["permissions", permissionIndex];
    if (permissionIds.has(permission.id)) {
      push([...permissionPath, "id"], "duplicate_id", `Duplicate permission id "${permission.id}"`);
    }
    permissionIds.add(permission.id);

    if (!roleIds.has(permission.roleId)) {
      push(
        [...permissionPath, "roleId"],
        "orphaned_reference",
        `Permission "${permission.id}" references unknown role "${permission.roleId}"`,
      );
    }
    if (!entityIds.has(permission.entityId)) {
      push(
        [...permissionPath, "entityId"],
        "orphaned_reference",
        `Permission "${permission.id}" references unknown entity "${permission.entityId}"`,
      );
    }

    const tupleKey = `${permission.roleId}:${permission.entityId}:${permission.verb}`;
    if (permissionTuples.has(tupleKey)) {
      push(
        [...permissionPath],
        "duplicate_permission",
        `Duplicate permission grant for role "${permission.roleId}", entity "${permission.entityId}", verb "${permission.verb}"`,
      );
    }
    permissionTuples.add(tupleKey);
  });

  // ── Pages & components ───────────────────────────────────────────────
  const pageIds = new Set<string>();
  const pagePaths = new Set<string>();
  spec.pages.forEach((page, pageIndex) => {
    const pagePath = ["pages", pageIndex];
    if (pageIds.has(page.id)) {
      push([...pagePath, "id"], "duplicate_id", `Duplicate page id "${page.id}"`);
    }
    pageIds.add(page.id);

    if (pagePaths.has(page.path)) {
      push([...pagePath, "path"], "duplicate_path", `Duplicate page path "${page.path}"`);
    }
    pagePaths.add(page.path);
    if (RESERVED_NAMES.has(page.path.toLowerCase())) {
      push([...pagePath, "path"], "reserved_name", `"${page.path}" is a reserved name and cannot be used as a page path`);
    }

    page.requiredRoleIds?.forEach((roleId, roleIdIndex) => {
      if (!roleIds.has(roleId)) {
        push(
          [...pagePath, "requiredRoleIds", roleIdIndex],
          "orphaned_reference",
          `Page "${page.id}" references unknown role "${roleId}"`,
        );
      }
    });

    const componentIds = new Set<string>();
    page.components.forEach((component, componentIndex) => {
      const componentPath = [...pagePath, "components", componentIndex];
      if (componentIds.has(component.id)) {
        push([...componentPath, "id"], "duplicate_id", `Duplicate component id "${component.id}" on page "${page.id}"`);
      }
      componentIds.add(component.id);

      if (component.entityId && !entityIds.has(component.entityId)) {
        push(
          [...componentPath, "entityId"],
          "orphaned_reference",
          `Component "${component.id}" references unknown entity "${component.entityId}"`,
        );
      }
      checkUnsafeConfig(component.config, [...componentPath, "config"], push);
    });
  });

  // ── Navigation ────────────────────────────────────────────────────────
  const navIds = new Set<string>();
  spec.navigation.forEach((item, itemIndex) => {
    const itemPath = ["navigation", itemIndex];
    if (navIds.has(item.id)) {
      push([...itemPath, "id"], "duplicate_id", `Duplicate navigation item id "${item.id}"`);
    }
    navIds.add(item.id);

    if (!pageIds.has(item.targetPageId)) {
      push(
        [...itemPath, "targetPageId"],
        "orphaned_reference",
        `Navigation item "${item.id}" references unknown page "${item.targetPageId}"`,
      );
    }
    item.requiredRoleIds?.forEach((roleId, roleIdIndex) => {
      if (!roleIds.has(roleId)) {
        push(
          [...itemPath, "requiredRoleIds", roleIdIndex],
          "orphaned_reference",
          `Navigation item "${item.id}" references unknown role "${roleId}"`,
        );
      }
    });
  });

  // ── Dashboard ─────────────────────────────────────────────────────────
  const widgetIds = new Set<string>();
  spec.dashboard.widgets.forEach((widget, widgetIndex) => {
    const widgetPath = ["dashboard", "widgets", widgetIndex];
    if (widgetIds.has(widget.id)) {
      push([...widgetPath, "id"], "duplicate_id", `Duplicate dashboard widget id "${widget.id}"`);
    }
    widgetIds.add(widget.id);
    if (widget.entityId && !entityIds.has(widget.entityId)) {
      push(
        [...widgetPath, "entityId"],
        "orphaned_reference",
        `Dashboard widget "${widget.id}" references unknown entity "${widget.entityId}"`,
      );
    }
    checkUnsafeConfig(widget.config, [...widgetPath, "config"], push);
  });

  // ── Actions ───────────────────────────────────────────────────────────
  const actionIds = new Set<string>();
  spec.actions.forEach((action, actionIndex) => {
    const actionPath = ["actions", actionIndex];
    if (actionIds.has(action.id)) {
      push([...actionPath, "id"], "duplicate_id", `Duplicate action id "${action.id}"`);
    }
    actionIds.add(action.id);
    if (action.entityId && !entityIds.has(action.entityId)) {
      push(
        [...actionPath, "entityId"],
        "orphaned_reference",
        `Action "${action.id}" references unknown entity "${action.entityId}"`,
      );
    }
    checkUnsafeConfig(action.config, [...actionPath, "config"], push);
  });

  // ── Workflows ─────────────────────────────────────────────────────────
  const workflowIds = new Set<string>();
  spec.workflows.forEach((workflow, workflowIndex) => {
    const workflowPath = ["workflows", workflowIndex];
    if (workflowIds.has(workflow.id)) {
      push([...workflowPath, "id"], "duplicate_id", `Duplicate workflow id "${workflow.id}"`);
    }
    workflowIds.add(workflow.id);

    if (workflow.trigger.entityId && !entityIds.has(workflow.trigger.entityId)) {
      push(
        [...workflowPath, "trigger", "entityId"],
        "orphaned_reference",
        `Workflow "${workflow.id}" trigger references unknown entity "${workflow.trigger.entityId}"`,
      );
    }

    const stepIds = new Set<string>();
    const stepPathIndexById = new Map<string, number>();
    workflow.steps.forEach((step, stepIndex) => {
      const stepPath = [...workflowPath, "steps", stepIndex];
      if (stepIds.has(step.id)) {
        push([...stepPath, "id"], "duplicate_id", `Duplicate workflow step id "${step.id}" in workflow "${workflow.id}"`);
      }
      stepIds.add(step.id);
      stepPathIndexById.set(step.id, stepIndex);
      checkUnsafeConfig(step.config, [...stepPath, "config"], push);
    });

    // Dangling condition-step references + cycle detection over the
    // condition-step branch graph (DFS with recursion-stack tracking).
    const adjacency = new Map<string, string[]>();
    workflow.steps.forEach((step) => {
      if (step.kind !== "condition") return;
      const next: string[] = [];
      for (const key of ["onTrueStepId", "onFalseStepId"] as const) {
        const target = step.config[key];
        if (target === undefined || target === null) continue;
        if (typeof target !== "string" || !stepIds.has(target)) {
          const stepIndex = stepPathIndexById.get(step.id)!;
          push(
            [...workflowPath, "steps", stepIndex, "config", key],
            "orphaned_reference",
            `Workflow "${workflow.id}" step "${step.id}" references unknown step "${String(target)}"`,
          );
          continue;
        }
        next.push(target);
      }
      adjacency.set(step.id, next);
    });

    const visited = new Set<string>();
    const inStack = new Set<string>();
    let cycleDetected = false;
    const visit = (stepId: string) => {
      if (cycleDetected) return;
      if (inStack.has(stepId)) {
        cycleDetected = true;
        return;
      }
      if (visited.has(stepId)) return;
      visited.add(stepId);
      inStack.add(stepId);
      for (const next of adjacency.get(stepId) ?? []) visit(next);
      inStack.delete(stepId);
    };
    for (const stepId of adjacency.keys()) visit(stepId);
    if (cycleDetected) {
      push(
        [...workflowPath, "steps"],
        "circular_reference",
        `Workflow "${workflow.id}" contains a circular condition-step reference`,
      );
    }
  });

  // ── Top-level content safety ─────────────────────────────────────────
  checkUnsafeText(spec.app.description, ["app", "description"], push);
  checkUnsafeText(spec.branding.companyName, ["branding", "companyName"], push);

  return { ok: errors.length === 0, errors };
}

function checkUnsafeText(
  value: string | undefined,
  path: (string | number)[],
  push: (path: (string | number)[], code: string, message: string) => void,
): void {
  if (!value) return;
  const violations = scanForUnsafeContent(value);
  for (const violation of violations) {
    push(path, "unsafe_content", `Unsafe content pattern detected (${violation.pattern}): "${violation.match}"`);
  }
}

function checkUnsafeConfig(
  config: Record<string, unknown>,
  path: (string | number)[],
  push: (path: (string | number)[], code: string, message: string) => void,
): void {
  for (const [key, value] of Object.entries(config)) {
    if (DANGEROUS_CONFIG_KEYS.has(key)) {
      push([...path, key], "unsafe_config_key", `Config key "${key}" is not permitted`);
    }
    if (typeof value === "string") {
      checkUnsafeText(value, [...path, key], push);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      checkUnsafeConfig(value as Record<string, unknown>, [...path, key], push);
    }
  }
}
