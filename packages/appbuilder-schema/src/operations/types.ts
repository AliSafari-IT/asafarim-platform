import { z } from "zod";
import { StableId } from "../ids";
import { Entity } from "../entities";
import { Field } from "../fields";
import { Relation } from "../relations";
import { Role, Permission } from "../rbac";
import { NavigationItem, Page, ComponentConfig, Action } from "../ui";
import { Workflow } from "../workflows";
import { Branding } from "../branding";
import { AppMetadata } from "../specification";
import { OPERATION_SCHEMA_VERSION } from "../constants";

const opVersion = z.literal(OPERATION_SCHEMA_VERSION);

// Inputs for "create" operations omit fields the engine itself initializes
// (archived: false, and — for entities/pages — their child collections,
// which are populated by their own dedicated add/update operations).
const EntityCreateInput = Entity.omit({ fields: true, indexes: true, archived: true });
const EntityPatch = Entity.pick({ name: true, description: true }).partial();

const RelationPatch = Relation.pick({ name: true, onDelete: true }).partial();

const PageCreateInput = Page.omit({ components: true, archived: true });
const PagePatch = Page.pick({ name: true, requiredRoleIds: true }).partial();

const RolePatch = Role.pick({ name: true, description: true }).partial();

const WorkflowPatch = Workflow.pick({ name: true, trigger: true, steps: true }).partial();

const AppMetadataPatch = AppMetadata.pick({ name: true, description: true }).partial();
const BrandingPatch = Branding.partial();

// A field's own type/relationId are immutable after creation (changing a
// field's type is destructive — see destructive.ts — and is expressed as
// archiving + re-adding, not an in-place UPDATE_FIELD type change) except
// where explicitly listed here.
const FieldPatch = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  unique: z.boolean().optional(),
});

const ComponentPatch = z.object({
  config: z.record(z.string(), z.unknown()).optional(),
  entityId: StableId.optional(),
});

function op<Type extends string, Shape extends z.ZodRawShape>(type: Type, shape: Shape) {
  return z.object({ opVersion, type: z.literal(type), ...shape });
}

export const CreateEntityOp = op("CREATE_ENTITY", { entity: EntityCreateInput });
export const UpdateEntityOp = op("UPDATE_ENTITY", { entityId: StableId, patch: EntityPatch });
export const ArchiveEntityOp = op("ARCHIVE_ENTITY", { entityId: StableId });

export const AddFieldOp = op("ADD_FIELD", { entityId: StableId, field: Field });
export const UpdateFieldOp = op("UPDATE_FIELD", { entityId: StableId, fieldId: StableId, patch: FieldPatch });
export const ArchiveFieldOp = op("ARCHIVE_FIELD", { entityId: StableId, fieldId: StableId });

export const CreateRelationOp = op("CREATE_RELATION", { relation: Relation.omit({ archived: true }) });
export const UpdateRelationOp = op("UPDATE_RELATION", { relationId: StableId, patch: RelationPatch });
export const ArchiveRelationOp = op("ARCHIVE_RELATION", { relationId: StableId });

export const CreatePageOp = op("CREATE_PAGE", { page: PageCreateInput });
export const UpdatePageOp = op("UPDATE_PAGE", { pageId: StableId, patch: PagePatch });
export const ArchivePageOp = op("ARCHIVE_PAGE", { pageId: StableId });

export const AddComponentOp = op("ADD_COMPONENT", { pageId: StableId, component: ComponentConfig });
export const UpdateComponentOp = op("UPDATE_COMPONENT", {
  pageId: StableId,
  componentId: StableId,
  patch: ComponentPatch,
});
export const MoveComponentOp = op("MOVE_COMPONENT", {
  pageId: StableId,
  componentId: StableId,
  newOrder: z.number().int().min(0),
});
export const RemoveComponentOp = op("REMOVE_COMPONENT", { pageId: StableId, componentId: StableId });

export const UpdateNavigationOp = op("UPDATE_NAVIGATION", { navigation: z.array(NavigationItem) });

export const CreateRoleOp = op("CREATE_ROLE", { role: Role.omit({ archived: true }) });
export const UpdateRoleOp = op("UPDATE_ROLE", { roleId: StableId, patch: RolePatch });

export const SetPermissionOp = op("SET_PERMISSION", { permission: Permission });
export const RemovePermissionOp = op("REMOVE_PERMISSION", { permissionId: StableId });

export const CreateWorkflowOp = op("CREATE_WORKFLOW", { workflow: Workflow.omit({ archived: true }) });
export const UpdateWorkflowOp = op("UPDATE_WORKFLOW", { workflowId: StableId, patch: WorkflowPatch });
export const ArchiveWorkflowOp = op("ARCHIVE_WORKFLOW", { workflowId: StableId });

export const UpdateBrandingOp = op("UPDATE_BRANDING", { patch: BrandingPatch });
export const UpdateAppMetadataOp = op("UPDATE_APP_METADATA", { patch: AppMetadataPatch });

// Re-exported for callers that need a create-time full ComponentConfig/Action
// shape without pulling in ui.ts directly.
export { Action };

/**
 * The full allowlisted operation catalog. Every variant is discriminated
 * on `type`; `opVersion` pins the operation *contract* version so a future
 * incompatible change to an operation's shape can be migrated deliberately
 * (see docs/appbuilder-schema.md#operation-versioning) instead of silently
 * reinterpreted.
 */
export const Operation = z.discriminatedUnion("type", [
  CreateEntityOp,
  UpdateEntityOp,
  ArchiveEntityOp,
  AddFieldOp,
  UpdateFieldOp,
  ArchiveFieldOp,
  CreateRelationOp,
  UpdateRelationOp,
  ArchiveRelationOp,
  CreatePageOp,
  UpdatePageOp,
  ArchivePageOp,
  AddComponentOp,
  UpdateComponentOp,
  MoveComponentOp,
  RemoveComponentOp,
  UpdateNavigationOp,
  CreateRoleOp,
  UpdateRoleOp,
  SetPermissionOp,
  RemovePermissionOp,
  CreateWorkflowOp,
  UpdateWorkflowOp,
  ArchiveWorkflowOp,
  UpdateBrandingOp,
  UpdateAppMetadataOp,
]);

export type OperationType = z.infer<typeof Operation>;
export type OperationKind = OperationType["type"];
