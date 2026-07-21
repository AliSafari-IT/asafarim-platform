import type { ApplicationSpecificationType } from "../specification";
import { OPERATION_SCHEMA_VERSION } from "../constants";
import type { OperationType } from "./types";

const opVersion = OPERATION_SCHEMA_VERSION;

/**
 * Computes the exact inverse of `operation`, given the specification it was
 * applied *against* (i.e. the version immediately before it), or `null`
 * when no safe inverse exists in the current operation catalog — e.g.
 * there is no "unarchive entity"/"restore role" operation, so undoing an
 * archive or a role creation is not attempted here; callers must fall back
 * to `restoreVersion` (restore-as-a-new-version) instead of guessing.
 *
 * Never mutates `before`.
 */
export function invertOperation(
  before: ApplicationSpecificationType,
  operation: OperationType,
): OperationType | null {
  switch (operation.type) {
    case "CREATE_ENTITY":
      return { opVersion, type: "ARCHIVE_ENTITY", entityId: operation.entity.id };
    case "ARCHIVE_ENTITY":
      return null; // no "restore entity" operation exists

    case "UPDATE_ENTITY": {
      const entity = before.entities.find((e) => e.id === operation.entityId);
      if (!entity) return null;
      return {
        opVersion,
        type: "UPDATE_ENTITY",
        entityId: operation.entityId,
        patch: { name: entity.name, description: entity.description },
      };
    }

    case "ADD_FIELD":
      return { opVersion, type: "ARCHIVE_FIELD", entityId: operation.entityId, fieldId: operation.field.id };
    case "ARCHIVE_FIELD":
      return null; // no "restore field" operation exists

    case "UPDATE_FIELD": {
      const entity = before.entities.find((e) => e.id === operation.entityId);
      const field = entity?.fields.find((f) => f.id === operation.fieldId);
      if (!field) return null;
      return {
        opVersion,
        type: "UPDATE_FIELD",
        entityId: operation.entityId,
        fieldId: operation.fieldId,
        patch: {
          name: field.name,
          description: field.description,
          required: field.required,
          unique: field.unique,
        },
      };
    }

    case "CREATE_RELATION":
      return { opVersion, type: "ARCHIVE_RELATION", relationId: operation.relation.id };
    case "ARCHIVE_RELATION":
      return null;

    case "UPDATE_RELATION": {
      const relation = before.relations.find((r) => r.id === operation.relationId);
      if (!relation) return null;
      return {
        opVersion,
        type: "UPDATE_RELATION",
        relationId: operation.relationId,
        patch: { name: relation.name, onDelete: relation.onDelete },
      };
    }

    case "CREATE_PAGE":
      return { opVersion, type: "ARCHIVE_PAGE", pageId: operation.page.id };
    case "ARCHIVE_PAGE":
      return null;

    case "UPDATE_PAGE": {
      const page = before.pages.find((p) => p.id === operation.pageId);
      if (!page) return null;
      return {
        opVersion,
        type: "UPDATE_PAGE",
        pageId: operation.pageId,
        patch: { name: page.name, requiredRoleIds: page.requiredRoleIds },
      };
    }

    case "ADD_COMPONENT":
      return { opVersion, type: "REMOVE_COMPONENT", pageId: operation.pageId, componentId: operation.component.id };

    case "REMOVE_COMPONENT": {
      const page = before.pages.find((p) => p.id === operation.pageId);
      const component = page?.components.find((c) => c.id === operation.componentId);
      if (!component) return null;
      return { opVersion, type: "ADD_COMPONENT", pageId: operation.pageId, component };
    }

    case "UPDATE_COMPONENT": {
      const page = before.pages.find((p) => p.id === operation.pageId);
      const component = page?.components.find((c) => c.id === operation.componentId);
      if (!component) return null;
      return {
        opVersion,
        type: "UPDATE_COMPONENT",
        pageId: operation.pageId,
        componentId: operation.componentId,
        patch: { config: component.config, entityId: component.entityId },
      };
    }

    case "MOVE_COMPONENT": {
      const page = before.pages.find((p) => p.id === operation.pageId);
      const component = page?.components.find((c) => c.id === operation.componentId);
      if (!component) return null;
      return {
        opVersion,
        type: "MOVE_COMPONENT",
        pageId: operation.pageId,
        componentId: operation.componentId,
        newOrder: component.order,
      };
    }

    case "UPDATE_NAVIGATION":
      return { opVersion, type: "UPDATE_NAVIGATION", navigation: before.navigation };

    case "CREATE_ROLE":
      return null; // no "archive role" operation exists

    case "UPDATE_ROLE": {
      const role = before.roles.find((r) => r.id === operation.roleId);
      if (!role) return null;
      return {
        opVersion,
        type: "UPDATE_ROLE",
        roleId: operation.roleId,
        patch: { name: role.name, description: role.description },
      };
    }

    case "SET_PERMISSION": {
      const priorPermission = before.permissions.find(
        (p) =>
          p.roleId === operation.permission.roleId &&
          p.entityId === operation.permission.entityId &&
          p.verb === operation.permission.verb,
      );
      if (priorPermission) {
        return { opVersion, type: "SET_PERMISSION", permission: priorPermission };
      }
      return { opVersion, type: "REMOVE_PERMISSION", permissionId: operation.permission.id };
    }

    case "REMOVE_PERMISSION": {
      const removed = before.permissions.find((p) => p.id === operation.permissionId);
      if (!removed) return null;
      return { opVersion, type: "SET_PERMISSION", permission: removed };
    }

    case "CREATE_WORKFLOW":
      return { opVersion, type: "ARCHIVE_WORKFLOW", workflowId: operation.workflow.id };
    case "ARCHIVE_WORKFLOW":
      return null;

    case "UPDATE_WORKFLOW": {
      const workflow = before.workflows.find((w) => w.id === operation.workflowId);
      if (!workflow) return null;
      return {
        opVersion,
        type: "UPDATE_WORKFLOW",
        workflowId: operation.workflowId,
        patch: { name: workflow.name, trigger: workflow.trigger, steps: workflow.steps },
      };
    }

    case "UPDATE_BRANDING":
      return { opVersion, type: "UPDATE_BRANDING", patch: before.branding };

    case "UPDATE_APP_METADATA":
      return {
        opVersion,
        type: "UPDATE_APP_METADATA",
        patch: { name: before.app.name, description: before.app.description },
      };

    default: {
      const exhaustive: never = operation;
      throw new Error(`Unhandled operation type: ${JSON.stringify(exhaustive)}`);
    }
  }
}
