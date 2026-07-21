import type { ApplicationSpecificationType } from "../specification";
import type { OperationType } from "./types";

export interface DestructiveImpact {
  /** Stable machine-readable reason, e.g. "entity_removed", "permission_reduced". */
  classification: string;
  /** Human-readable, specific impact notes for a confirmation prompt. */
  details: string[];
}

/**
 * Classifies whether an operation's effect on the specification is
 * destructive — removing an entity/field/relation/page/workflow, tightening
 * a required/unique constraint, widening a delete cascade, or reducing a
 * previously granted permission. Returns `null` for a non-destructive
 * change. Never inspects generated-app *data* (there is none at this
 * layer) — only the specification's own structure.
 */
export function classifyDestructiveChange(
  before: ApplicationSpecificationType,
  after: ApplicationSpecificationType,
  operation: OperationType,
): DestructiveImpact | null {
  switch (operation.type) {
    case "ARCHIVE_ENTITY": {
      const entity = before.entities.find((e) => e.id === operation.entityId);
      if (!entity) return null;
      const dependents = [
        ...before.relations.filter(
          (r) => r.fromEntityId === operation.entityId || r.toEntityId === operation.entityId,
        ),
        ...before.permissions.filter((p) => p.entityId === operation.entityId),
      ];
      return {
        classification: "entity_removed",
        details: [
          `Archiving entity "${entity.name}" (${entity.id})`,
          ...(dependents.length > 0 ? [`${dependents.length} dependent relation(s)/permission(s) reference this entity`] : []),
        ],
      };
    }

    case "ARCHIVE_FIELD": {
      const entity = before.entities.find((e) => e.id === operation.entityId);
      const field = entity?.fields.find((f) => f.id === operation.fieldId);
      if (!field) return null;
      return {
        classification: "field_removed",
        details: [`Archiving field "${field.name}" (${field.id}) on entity "${entity!.name}"`],
      };
    }

    case "UPDATE_FIELD": {
      const entity = before.entities.find((e) => e.id === operation.entityId);
      const field = entity?.fields.find((f) => f.id === operation.fieldId);
      if (!field) return null;
      const details: string[] = [];
      if (operation.patch.required === true && field.required === false) {
        details.push(`Field "${field.name}" becomes required — existing records without a value would be invalid`);
      }
      if (operation.patch.unique === true && field.unique === false) {
        details.push(`Field "${field.name}" becomes unique — existing duplicate values would be invalid`);
      }
      return details.length > 0 ? { classification: "constraint_tightened", details } : null;
    }

    case "ARCHIVE_RELATION": {
      const relation = before.relations.find((r) => r.id === operation.relationId);
      if (!relation) return null;
      return {
        classification: "relation_removed",
        details: [`Archiving relation "${relation.name}" (${relation.fromEntityId} -> ${relation.toEntityId})`],
      };
    }

    case "UPDATE_RELATION": {
      const relation = before.relations.find((r) => r.id === operation.relationId);
      if (!relation) return null;
      if (operation.patch.onDelete === "cascade" && relation.onDelete !== "cascade") {
        return {
          classification: "relation_delete_widened",
          details: [`Relation "${relation.name}" delete behavior widened to cascade`],
        };
      }
      return null;
    }

    case "ARCHIVE_PAGE": {
      const page = before.pages.find((p) => p.id === operation.pageId);
      if (!page) return null;
      return { classification: "page_removed", details: [`Archiving page "${page.name}" (${page.path})`] };
    }

    case "ARCHIVE_WORKFLOW": {
      const workflow = before.workflows.find((w) => w.id === operation.workflowId);
      if (!workflow) return null;
      return { classification: "workflow_removed", details: [`Archiving workflow "${workflow.name}"`] };
    }

    case "SET_PERMISSION": {
      const existing = before.permissions.find(
        (p) =>
          p.roleId === operation.permission.roleId &&
          p.entityId === operation.permission.entityId &&
          p.verb === operation.permission.verb,
      );
      if (existing?.effect === "allow" && operation.permission.effect === "deny") {
        return {
          classification: "permission_reduced",
          details: [
            `Role "${operation.permission.roleId}" loses "${operation.permission.verb}" access on entity "${operation.permission.entityId}"`,
          ],
        };
      }
      return null;
    }

    case "REMOVE_PERMISSION": {
      const removed = before.permissions.find((p) => p.id === operation.permissionId);
      if (!removed || removed.effect !== "allow") return null;
      return {
        classification: "permission_reduced",
        details: [
          `Role "${removed.roleId}" loses "${removed.verb}" access on entity "${removed.entityId}"`,
        ],
      };
    }

    default:
      return null;
  }
}
