import { z } from "zod";
import { StableId, DisplayName } from "./ids";
import { Entity } from "./entities";
import { Relation } from "./relations";
import { Role, Permission } from "./rbac";
import { NavigationItem, Page, Dashboard, Action } from "./ui";
import { Workflow } from "./workflows";
import { Branding } from "./branding";
import { SPEC_SCHEMA_VERSION, LIMITS } from "./constants";

export const AppMetadata = z.object({
  name: DisplayName,
  slug: StableId,
  description: z.string().max(LIMITS.MAX_SHORT_TEXT_LENGTH).optional(),
});
export type AppMetadataType = z.infer<typeof AppMetadata>;

/**
 * The single source of truth shared by the AI planner (M07) and the
 * metadata-driven runtime (M06). `schemaVersion` is a literal — parsing a
 * specification written against an older/newer schema version is a
 * deliberate compatibility decision the consumer must make explicitly
 * (see docs/appbuilder-schema.md#version-policy), not something Zod
 * silently coerces.
 */
export const ApplicationSpecification = z.object({
  schemaVersion: z.literal(SPEC_SCHEMA_VERSION),
  app: AppMetadata,
  branding: Branding.default({}),
  entities: z.array(Entity).max(LIMITS.MAX_ENTITIES).default([]),
  relations: z.array(Relation).max(LIMITS.MAX_RELATIONS).default([]),
  roles: z.array(Role).max(LIMITS.MAX_ROLES).default([]),
  permissions: z.array(Permission).max(LIMITS.MAX_PERMISSIONS).default([]),
  navigation: z.array(NavigationItem).max(LIMITS.MAX_NAVIGATION_ITEMS).default([]),
  pages: z.array(Page).max(LIMITS.MAX_PAGES).default([]),
  dashboard: Dashboard.default({ widgets: [] }),
  actions: z.array(Action).max(LIMITS.MAX_ACTIONS).default([]),
  workflows: z.array(Workflow).max(LIMITS.MAX_WORKFLOWS).default([]),
});
export type ApplicationSpecificationType = z.infer<typeof ApplicationSpecification>;

/** The empty specification a brand-new app starts from (version 0 → 1). */
export function emptySpecification(app: AppMetadataType): ApplicationSpecificationType {
  return {
    schemaVersion: SPEC_SCHEMA_VERSION,
    app,
    branding: { theme: "system" },
    entities: [],
    relations: [],
    roles: [],
    permissions: [],
    navigation: [],
    pages: [],
    dashboard: { widgets: [] },
    actions: [],
    workflows: [],
  };
}
