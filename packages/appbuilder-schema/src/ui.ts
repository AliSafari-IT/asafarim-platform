import { z } from "zod";
import { StableId, DisplayName } from "./ids";
import { COMPONENT_KINDS, ACTION_KINDS, LIMITS } from "./constants";

/**
 * Free-form-looking but bounded: keys/values are plain JSON, validated
 * for content safety (no script/HTML/SQL payloads) by validation.ts, and
 * never interpreted as code by the pure engine — only the concrete M06
 * renderer gives these keys meaning, against its own registry.
 */
export const ComponentConfigValue = z.record(z.string(), z.unknown());

export const ComponentConfig = z.object({
  id: StableId,
  kind: z.enum(COMPONENT_KINDS),
  /** The entity this component is bound to, when the kind is data-driven. */
  entityId: StableId.optional(),
  config: ComponentConfigValue.default({}),
  order: z.number().int().min(0),
});
export type ComponentConfigType = z.infer<typeof ComponentConfig>;

export const Page = z.object({
  id: StableId,
  name: DisplayName,
  path: StableId,
  components: z.array(ComponentConfig).max(LIMITS.MAX_COMPONENTS_PER_PAGE).default([]),
  requiredRoleIds: z.array(StableId).max(LIMITS.MAX_ROLES).optional(),
  archived: z.boolean().default(false),
});
export type PageType = z.infer<typeof Page>;

export const NavigationItem = z.object({
  id: StableId,
  label: DisplayName,
  targetPageId: StableId,
  icon: z.string().max(100).optional(),
  order: z.number().int().min(0),
  requiredRoleIds: z.array(StableId).max(LIMITS.MAX_ROLES).optional(),
});
export type NavigationItemType = z.infer<typeof NavigationItem>;

/** Dashboard widgets are components restricted to the "widget" kinds. */
export const DashboardWidget = z.object({
  id: StableId,
  kind: z.enum(["statWidget", "chartWidget"] as const),
  entityId: StableId.optional(),
  config: ComponentConfigValue.default({}),
  order: z.number().int().min(0),
});
export type DashboardWidgetType = z.infer<typeof DashboardWidget>;

export const Dashboard = z.object({
  widgets: z.array(DashboardWidget).max(LIMITS.MAX_DASHBOARD_WIDGETS).default([]),
});
export type DashboardType = z.infer<typeof Dashboard>;

export const Action = z.object({
  id: StableId,
  name: DisplayName,
  kind: z.enum(ACTION_KINDS),
  entityId: StableId.optional(),
  config: ComponentConfigValue.default({}),
  archived: z.boolean().default(false),
});
export type ActionType = z.infer<typeof Action>;
