/**
 * Defense-in-depth rendering ceilings, deliberately at or below the schema
 * package's own LIMITS (packages/appbuilder-schema/src/constants.ts). The
 * schema validator already rejects a specification that exceeds its
 * LIMITS — these exist so the renderer itself never assumes an upstream
 * spec was validated by *this* version of the validator (e.g. a spec
 * restored from an older engine version) and always fails closed rather
 * than attempting to render an unbounded tree.
 */
export const RENDER_LIMITS = {
  MAX_COMPONENTS_PER_PAGE: 100,
  MAX_NAVIGATION_ITEMS: 100,
  MAX_KANBAN_COLUMNS: 12,
  MAX_KANBAN_CARDS_PER_COLUMN: 50,
  MAX_TIMELINE_ITEMS: 100,
  MAX_TABLE_ROWS: 200,
  MAX_TABLE_COLUMNS: 40,
  MAX_FORM_FIELDS: 60,
  MAX_CHART_SERIES_POINTS: 60,
  /** Components are a flat, non-recursive list per page (no children field
   *  exists on ComponentConfig) — this bounds any sub-structure a single
   *  component's own config is allowed to nest (e.g. settings-panel
   *  sections), not a component tree. */
  MAX_CONFIG_NESTING_DEPTH: 4,
} as const;
