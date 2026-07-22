import type { ReactElement } from "react";
import type { z } from "zod";
import type { ApplicationSpecificationType, EntityType } from "@asafarim/appbuilder-schema";
import type { ResolvedBranding } from "../security/branding";
import type { RenderError } from "../render/types";

export type ComponentCategory =
  | "chrome"
  | "layout"
  | "data"
  | "input"
  | "detail"
  | "visualization"
  | "feedback";

export type DataBindingShape = "none" | "singleEntity" | "entityList";

/**
 * Metadata shared by every catalog entry — chrome primitives (which render
 * exactly once, driven by the whole specification rather than a single page
 * component) and per-component registry entries (keyed by schema `kind` +
 * `variant`) alike. Kept separate from `RegistryEntry` below so the
 * inventory can be introspected/documented uniformly without forcing chrome
 * primitives into the per-component render signature they don't use.
 */
export interface CatalogEntryMeta {
  /** Stable identifier — never the display name. Never renamed once shipped; superseded entries get a new id plus `deprecated`. */
  typeId: string;
  displayName: string;
  category: ComponentCategory;
  /** This entry's own version — bumped when its rendering/config contract changes. */
  version: string;
  responsiveNotes: string;
  emptyStateDescription: string;
  loadingStateDescription: string;
  errorStateDescription: string;
  a11yNotes: string;
  deprecated?: { since: string; migrateTo: string; note: string };
}

export interface ComponentRenderProps<TConfig> {
  componentId: string;
  config: TConfig;
  entity: EntityType | undefined;
  spec: ApplicationSpecificationType;
  branding: ResolvedBranding;
  /** Report a non-fatal issue discovered while rendering (e.g. a referenced field no longer exists) without aborting the whole page. */
  reportWarning: (error: Omit<RenderError, "path">) => void;
}

/**
 * A page-component registry entry. Addressed by the composite key
 * `{schemaKind}` (default variant) or `{schemaKind}.{variant}` — see
 * registry.ts#registryKey. Multiple logical primitives (e.g. Kanban board,
 * calendar view) deliberately share one `@asafarim/appbuilder-schema`
 * `kind` via `config.variant`, because COMPONENT_KINDS is a frozen
 * validation allowlist (extending it is a schema-version-bumping change,
 * out of scope for M06 — see packages/appbuilder-schema/README.md).
 */
export interface RegistryEntry<TConfig = Record<string, unknown>> extends CatalogEntryMeta {
  schemaKind: string;
  variant: string;
  configSchema: z.ZodType<TConfig>;
  dataBinding: DataBindingShape;
  /** Action kinds (@asafarim/appbuilder-schema ACTION_KINDS) this component can surface as a preview-only affordance. */
  supportedActions: string[];
  render(props: ComponentRenderProps<TConfig>): ReactElement;
}

export type AnyRegistryEntry = RegistryEntry<Record<string, unknown>>;
