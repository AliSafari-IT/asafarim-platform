import type { ApplicationSpecificationType } from "../specification";
import type { ValidationIssue } from "../validation";
import { validateSpecification } from "../validation";
import { checksumOf } from "../canonical";
import { ENGINE_VERSION } from "../constants";
import { Operation, type OperationType } from "./types";
import { classifyDestructiveChange, type DestructiveImpact } from "./destructive";

export interface OperationSuccess {
  ok: true;
  spec: ApplicationSpecificationType;
  checksum: string;
  summary: string;
  engineVersion: string;
  /** Populated whenever the change is destructive, confirmed or not. */
  destructive: DestructiveImpact | null;
}

export interface OperationFailure {
  ok: false;
  errors: ValidationIssue[];
  /** Set (with `errors` containing exactly one "confirmation_required" issue) when a destructive change was attempted without `confirmDestructive: true`. */
  destructive?: DestructiveImpact;
}

export type OperationOutcome = OperationSuccess | OperationFailure;

export interface ApplyOperationOptions {
  /** Must be true to let a destructive change through — see destructive.ts. */
  confirmDestructive?: boolean;
}

function issue(path: (string | number)[], code: string, message: string): ValidationIssue {
  return { path, code, message };
}

function fail(errors: ValidationIssue[]): OperationFailure {
  return { ok: false, errors };
}

/**
 * The pure, deterministic controlled-operation engine. Never mutates
 * `spec`; never reads the clock, RNG, or any ambient state. Every id this
 * function needs (a new entity/field/page/... id) must already be present
 * on the operation payload — the engine only validates and applies, it
 * never generates.
 *
 * `rawOperation` is `unknown` because callers (API routes, the future AI
 * orchestrator) hand this untrusted JSON directly; it is validated here,
 * not assumed to already match `OperationType`.
 */
export function applySpecOperation(
  spec: ApplicationSpecificationType,
  rawOperation: unknown,
  options: ApplyOperationOptions = {},
): OperationOutcome {
  const parsed = Operation.safeParse(rawOperation);
  if (!parsed.success) {
    return fail(
      parsed.error.issues.map((zodIssue) => issue(zodIssue.path, "invalid_operation", zodIssue.message)),
    );
  }
  const operation = parsed.data;

  const transformed = transform(spec, operation);
  if (!transformed.ok) {
    return fail(transformed.errors);
  }

  const validation = validateSpecification(transformed.spec);
  if (!validation.ok) {
    return fail(validation.errors);
  }

  const destructive = classifyDestructiveChange(spec, transformed.spec, operation);
  if (destructive && !options.confirmDestructive) {
    return {
      ok: false,
      destructive,
      errors: [
        issue(
          [],
          "destructive_confirmation_required",
          `This change (${destructive.classification}) is destructive and requires explicit confirmation.`,
        ),
      ],
    };
  }

  return {
    ok: true,
    spec: transformed.spec,
    checksum: checksumOf(transformed.spec),
    summary: summarize(operation),
    engineVersion: ENGINE_VERSION,
    destructive,
  };
}

interface TransformSuccess {
  ok: true;
  spec: ApplicationSpecificationType;
}
interface TransformFailure {
  ok: false;
  errors: ValidationIssue[];
}
type TransformResult = TransformSuccess | TransformFailure;

function ok(spec: ApplicationSpecificationType): TransformResult {
  return { ok: true, spec };
}
function notFound(path: (string | number)[], code: string, message: string): TransformResult {
  return { ok: false, errors: [issue(path, code, message)] };
}

/** Structural clone — never mutates the input; every branch below builds new arrays/objects. */
function clone(spec: ApplicationSpecificationType): ApplicationSpecificationType {
  return structuredClone(spec);
}

function transform(spec: ApplicationSpecificationType, operation: OperationType): TransformResult {
  const next = clone(spec);

  switch (operation.type) {
    case "CREATE_ENTITY": {
      if (next.entities.some((e) => e.id === operation.entity.id)) {
        return notFound(["entity", "id"], "duplicate_id", `Entity "${operation.entity.id}" already exists`);
      }
      next.entities.push({ ...operation.entity, fields: [], indexes: [], archived: false });
      return ok(next);
    }

    case "UPDATE_ENTITY": {
      const entity = next.entities.find((e) => e.id === operation.entityId);
      if (!entity) return notFound(["entityId"], "not_found", `Entity "${operation.entityId}" not found`);
      Object.assign(entity, operation.patch);
      return ok(next);
    }

    case "ARCHIVE_ENTITY": {
      const entity = next.entities.find((e) => e.id === operation.entityId);
      if (!entity) return notFound(["entityId"], "not_found", `Entity "${operation.entityId}" not found`);
      entity.archived = true;
      return ok(next);
    }

    case "ADD_FIELD": {
      const entity = next.entities.find((e) => e.id === operation.entityId);
      if (!entity) return notFound(["entityId"], "not_found", `Entity "${operation.entityId}" not found`);
      if (entity.fields.some((f) => f.id === operation.field.id)) {
        return notFound(["field", "id"], "duplicate_id", `Field "${operation.field.id}" already exists`);
      }
      entity.fields.push(operation.field);
      return ok(next);
    }

    case "UPDATE_FIELD": {
      const entity = next.entities.find((e) => e.id === operation.entityId);
      const field = entity?.fields.find((f) => f.id === operation.fieldId);
      if (!entity || !field) return notFound(["fieldId"], "not_found", `Field "${operation.fieldId}" not found`);
      Object.assign(field, operation.patch);
      return ok(next);
    }

    case "ARCHIVE_FIELD": {
      const entity = next.entities.find((e) => e.id === operation.entityId);
      const field = entity?.fields.find((f) => f.id === operation.fieldId);
      if (!entity || !field) return notFound(["fieldId"], "not_found", `Field "${operation.fieldId}" not found`);
      field.archived = true;
      return ok(next);
    }

    case "CREATE_RELATION": {
      if (next.relations.some((r) => r.id === operation.relation.id)) {
        return notFound(["relation", "id"], "duplicate_id", `Relation "${operation.relation.id}" already exists`);
      }
      next.relations.push({ ...operation.relation, archived: false });
      return ok(next);
    }

    case "UPDATE_RELATION": {
      const relation = next.relations.find((r) => r.id === operation.relationId);
      if (!relation) return notFound(["relationId"], "not_found", `Relation "${operation.relationId}" not found`);
      Object.assign(relation, operation.patch);
      return ok(next);
    }

    case "ARCHIVE_RELATION": {
      const relation = next.relations.find((r) => r.id === operation.relationId);
      if (!relation) return notFound(["relationId"], "not_found", `Relation "${operation.relationId}" not found`);
      relation.archived = true;
      return ok(next);
    }

    case "CREATE_PAGE": {
      if (next.pages.some((p) => p.id === operation.page.id)) {
        return notFound(["page", "id"], "duplicate_id", `Page "${operation.page.id}" already exists`);
      }
      next.pages.push({ ...operation.page, components: [], archived: false });
      return ok(next);
    }

    case "UPDATE_PAGE": {
      const page = next.pages.find((p) => p.id === operation.pageId);
      if (!page) return notFound(["pageId"], "not_found", `Page "${operation.pageId}" not found`);
      Object.assign(page, operation.patch);
      return ok(next);
    }

    case "ARCHIVE_PAGE": {
      const page = next.pages.find((p) => p.id === operation.pageId);
      if (!page) return notFound(["pageId"], "not_found", `Page "${operation.pageId}" not found`);
      page.archived = true;
      return ok(next);
    }

    case "ADD_COMPONENT": {
      const page = next.pages.find((p) => p.id === operation.pageId);
      if (!page) return notFound(["pageId"], "not_found", `Page "${operation.pageId}" not found`);
      if (page.components.some((c) => c.id === operation.component.id)) {
        return notFound(["component", "id"], "duplicate_id", `Component "${operation.component.id}" already exists`);
      }
      page.components.push(operation.component);
      return ok(next);
    }

    case "UPDATE_COMPONENT": {
      const page = next.pages.find((p) => p.id === operation.pageId);
      const component = page?.components.find((c) => c.id === operation.componentId);
      if (!page || !component) {
        return notFound(["componentId"], "not_found", `Component "${operation.componentId}" not found`);
      }
      Object.assign(component, operation.patch);
      return ok(next);
    }

    case "MOVE_COMPONENT": {
      const page = next.pages.find((p) => p.id === operation.pageId);
      const component = page?.components.find((c) => c.id === operation.componentId);
      if (!page || !component) {
        return notFound(["componentId"], "not_found", `Component "${operation.componentId}" not found`);
      }
      component.order = operation.newOrder;
      return ok(next);
    }

    case "REMOVE_COMPONENT": {
      const page = next.pages.find((p) => p.id === operation.pageId);
      if (!page) return notFound(["pageId"], "not_found", `Page "${operation.pageId}" not found`);
      const beforeLength = page.components.length;
      page.components = page.components.filter((c) => c.id !== operation.componentId);
      if (page.components.length === beforeLength) {
        return notFound(["componentId"], "not_found", `Component "${operation.componentId}" not found`);
      }
      return ok(next);
    }

    case "UPDATE_NAVIGATION": {
      next.navigation = operation.navigation;
      return ok(next);
    }

    case "CREATE_ROLE": {
      if (next.roles.some((r) => r.id === operation.role.id)) {
        return notFound(["role", "id"], "duplicate_id", `Role "${operation.role.id}" already exists`);
      }
      next.roles.push({ ...operation.role, archived: false });
      return ok(next);
    }

    case "UPDATE_ROLE": {
      const role = next.roles.find((r) => r.id === operation.roleId);
      if (!role) return notFound(["roleId"], "not_found", `Role "${operation.roleId}" not found`);
      Object.assign(role, operation.patch);
      return ok(next);
    }

    case "SET_PERMISSION": {
      const index = next.permissions.findIndex(
        (p) =>
          p.roleId === operation.permission.roleId &&
          p.entityId === operation.permission.entityId &&
          p.verb === operation.permission.verb,
      );
      if (index >= 0) {
        next.permissions[index] = operation.permission;
      } else {
        next.permissions.push(operation.permission);
      }
      return ok(next);
    }

    case "REMOVE_PERMISSION": {
      const beforeLength = next.permissions.length;
      next.permissions = next.permissions.filter((p) => p.id !== operation.permissionId);
      if (next.permissions.length === beforeLength) {
        return notFound(["permissionId"], "not_found", `Permission "${operation.permissionId}" not found`);
      }
      return ok(next);
    }

    case "CREATE_WORKFLOW": {
      if (next.workflows.some((w) => w.id === operation.workflow.id)) {
        return notFound(["workflow", "id"], "duplicate_id", `Workflow "${operation.workflow.id}" already exists`);
      }
      next.workflows.push({ ...operation.workflow, archived: false });
      return ok(next);
    }

    case "UPDATE_WORKFLOW": {
      const workflow = next.workflows.find((w) => w.id === operation.workflowId);
      if (!workflow) return notFound(["workflowId"], "not_found", `Workflow "${operation.workflowId}" not found`);
      Object.assign(workflow, operation.patch);
      return ok(next);
    }

    case "ARCHIVE_WORKFLOW": {
      const workflow = next.workflows.find((w) => w.id === operation.workflowId);
      if (!workflow) return notFound(["workflowId"], "not_found", `Workflow "${operation.workflowId}" not found`);
      workflow.archived = true;
      return ok(next);
    }

    case "UPDATE_BRANDING": {
      Object.assign(next.branding, operation.patch);
      return ok(next);
    }

    case "UPDATE_APP_METADATA": {
      Object.assign(next.app, operation.patch);
      return ok(next);
    }

    default: {
      const exhaustive: never = operation;
      throw new Error(`Unhandled operation type: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function summarize(operation: OperationType): string {
  switch (operation.type) {
    case "CREATE_ENTITY":
      return `Created entity "${operation.entity.name}"`;
    case "UPDATE_ENTITY":
      return `Updated entity "${operation.entityId}"`;
    case "ARCHIVE_ENTITY":
      return `Archived entity "${operation.entityId}"`;
    case "ADD_FIELD":
      return `Added field "${operation.field.name}" to entity "${operation.entityId}"`;
    case "UPDATE_FIELD":
      return `Updated field "${operation.fieldId}" on entity "${operation.entityId}"`;
    case "ARCHIVE_FIELD":
      return `Archived field "${operation.fieldId}" on entity "${operation.entityId}"`;
    case "CREATE_RELATION":
      return `Created relation "${operation.relation.name}"`;
    case "UPDATE_RELATION":
      return `Updated relation "${operation.relationId}"`;
    case "ARCHIVE_RELATION":
      return `Archived relation "${operation.relationId}"`;
    case "CREATE_PAGE":
      return `Created page "${operation.page.name}"`;
    case "UPDATE_PAGE":
      return `Updated page "${operation.pageId}"`;
    case "ARCHIVE_PAGE":
      return `Archived page "${operation.pageId}"`;
    case "ADD_COMPONENT":
      return `Added component "${operation.component.kind}" to page "${operation.pageId}"`;
    case "UPDATE_COMPONENT":
      return `Updated component "${operation.componentId}" on page "${operation.pageId}"`;
    case "MOVE_COMPONENT":
      return `Moved component "${operation.componentId}" on page "${operation.pageId}"`;
    case "REMOVE_COMPONENT":
      return `Removed component "${operation.componentId}" from page "${operation.pageId}"`;
    case "UPDATE_NAVIGATION":
      return `Updated navigation (${operation.navigation.length} item(s))`;
    case "CREATE_ROLE":
      return `Created role "${operation.role.name}"`;
    case "UPDATE_ROLE":
      return `Updated role "${operation.roleId}"`;
    case "SET_PERMISSION":
      return `Set permission for role "${operation.permission.roleId}" on entity "${operation.permission.entityId}"`;
    case "REMOVE_PERMISSION":
      return `Removed permission "${operation.permissionId}"`;
    case "CREATE_WORKFLOW":
      return `Created workflow "${operation.workflow.name}"`;
    case "UPDATE_WORKFLOW":
      return `Updated workflow "${operation.workflowId}"`;
    case "ARCHIVE_WORKFLOW":
      return `Archived workflow "${operation.workflowId}"`;
    case "UPDATE_BRANDING":
      return "Updated branding";
    case "UPDATE_APP_METADATA":
      return "Updated app metadata";
    default: {
      const exhaustive: never = operation;
      throw new Error(`Unhandled operation type: ${JSON.stringify(exhaustive)}`);
    }
  }
}
