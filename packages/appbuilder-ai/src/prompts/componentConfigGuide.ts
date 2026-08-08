/**
 * Authoritative reference for what belongs in a page component's `config`
 * object, injected into every prompt that can propose an ADD_COMPONENT or
 * UPDATE_COMPONENT operation (buildOperationPrompt, buildModificationPrompt,
 * buildRepairPrompt).
 *
 * Why this exists: `ComponentConfig.config` in @asafarim/appbuilder-schema
 * (ui.ts) is deliberately a loose `Record<string, unknown>` at the
 * generation-time contract level — it has to cover every component kind
 * with one shape. The *actual* per-kind shape is only enforced later, at
 * preview-render time, by the `.strict()` Zod schemas in
 * packages/appbuilder-runtime/src/registry/configSchemas.ts. Nothing
 * between those two layers currently re-validates or auto-repairs a
 * mismatch (renderPreview.tsx's "Invalid component configuration" /
 * "Unrecognized key(s)" error is a client-side rendering fallback, not a
 * server-side validation gate the M10 repair loop ever sees) — so an
 * invalid config the model invents here reaches the user's preview as a
 * visibly broken widget, silently. This guide is the fix: give the model
 * the real per-kind key list so it never has a reason to guess.
 *
 * Source of truth is configSchemas.ts. Kept in sync by
 * componentConfigGuide.test.ts, which imports the real schemas (as a
 * devDependency on @asafarim/appbuilder-runtime — test-only, no runtime
 * coupling) and asserts every key named below is actually accepted.
 * Update both together.
 */
export const COMPONENT_CONFIG_GUIDE = `COMPONENT CONFIG REFERENCE (ADD_COMPONENT / UPDATE_COMPONENT):

A component's top-level "kind" MUST be exactly one of: dataTable, form, detailView, statWidget, chartWidget, buttonAction.
Several rendered widgets share one of those "kind" values and are distinguished by a "variant" key inside "config" — get the (kind, config.variant) PAIR right, not just the kind, or the component fails to resolve.

kind="dataTable":
  - config.variant="table" (or omit — this is the default): { fieldIds?: string[], pageSize?: number }
  - config.variant="kanban": { variant: "kanban", groupByFieldId: string (REQUIRED — must be a select field id on the bound entity), cardTitleFieldId?: string }
  - config.variant="calendar": { variant: "calendar", dateFieldId: string (REQUIRED — must be a date/datetime field id), titleFieldId?: string }
  - No "columns", "sort", or "filters" key exists on any dataTable variant. Column selection is "fieldIds" (an array of field ids, not display names). There is no sort configuration — the renderer does not support one.

kind="form":
  - config.variant="form" (or omit): { fieldIds?: string[], submitLabel?: string }
  - config.variant="filters": { variant: "filters", filterableFieldIds: string[] (REQUIRED, 1-20 items), searchable?: boolean }
  - config.variant="settingsPanel": { variant: "settingsPanel", sections?: Array<{ title: string, fields: Array<{ label: string, value?: string }> }> }

kind="detailView":
  - config.variant="detail" (or omit): { fieldIds?: string[] }
  - config.variant="activityTimeline": { variant: "activityTimeline", items?: Array<{ time: string, title: string, meta?: string }> }
  - config.variant="fileField": { variant: "fileField", fieldId?: string, label?: string }
  - config.variant="emptyState": { variant: "emptyState", title: string (REQUIRED), description?: string }

kind="statWidget":
  - config: { metric?: "count" | "sum" | "average", filter?: string, label?: string }
  - No "variant" key on this kind.

kind="chartWidget":
  - config: { chartType?: "bar" | "line" | "pie", groupBy?: string }
  - No "variant" key on this kind.

kind="buttonAction":
  - config: { label?: string } — ONLY "label". Do not add "action", "onClick", "href", or "targetPageId" to a buttonAction's config; none of those keys exist on this schema.
  - The schema also has an optional "actionId" field, but there is currently no operation that creates an Action to reference (the operation catalog has no CREATE_ACTION), and wired button behavior isn't live until a later milestone regardless. Until a CREATE_ACTION-style operation exists, omit "actionId" entirely and use "label" alone for a descriptive, currently-inert button — do not invent a substitute key to express "what this button does."
  - Page-to-page navigation is a NavigationItem (its own top-level "navigation" array, added via UPDATE_NAVIGATION — targetPageId is a real field, but only there, never inside a component's config).

Every config object above is validated with Zod's ".strict()" — any key not listed for that (kind, variant) pair is a hard validation failure at render time, not a warning. When in doubt, include fewer keys, not more: every field above except the ones marked REQUIRED is optional, and omitting an optional key is always safe.`;
