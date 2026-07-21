/**
 * The specification format's own version — bumped when the *shape* of
 * ApplicationSpecification changes in a way consumers must know about.
 * Distinct from an app's own `versionNumber` (its edit-history counter).
 */
export const SPEC_SCHEMA_VERSION = "1.0.0";

/**
 * The pure operation engine's version — bumped when operation semantics or
 * the deterministic-transformation algorithm change. Stored on every
 * persisted specification version so a stored checksum can always be
 * reproduced against the exact engine that produced it.
 */
export const ENGINE_VERSION = "1.0.0";

/** The operation contract's own version — see docs/appbuilder-schema.md. */
export const OPERATION_SCHEMA_VERSION = "1.0.0";

// ─── Bounded collection sizes ────────────────────────────────────────────
// Conservative MVP ceilings. Not a performance limit so much as a trust
// boundary: an AI planner (M07) or a malicious client cannot balloon a
// specification into something the validator/engine can't reason about.
export const LIMITS = {
  MAX_ENTITIES: 100,
  MAX_FIELDS_PER_ENTITY: 100,
  MAX_INDEXES_PER_ENTITY: 20,
  MAX_RELATIONS: 200,
  MAX_ROLES: 50,
  MAX_PERMISSIONS: 500,
  MAX_NAVIGATION_ITEMS: 100,
  MAX_PAGES: 200,
  MAX_COMPONENTS_PER_PAGE: 100,
  MAX_DASHBOARD_WIDGETS: 50,
  MAX_ACTIONS: 200,
  MAX_WORKFLOWS: 100,
  MAX_WORKFLOW_STEPS: 50,
  MAX_SELECT_OPTIONS: 200,
  MAX_ID_LENGTH: 64,
  MAX_NAME_LENGTH: 200,
  MAX_SHORT_TEXT_LENGTH: 2_000,
  MAX_LONG_TEXT_LENGTH: 20_000,
  MAX_SUMMARY_LENGTH: 500,
} as const;

/**
 * Reserved machine names — never valid as an entity/field/page/role
 * machine name. Covers SQL/JS reserved words a naive runtime (M06/M09)
 * might otherwise interpolate unsafely, and platform-meaning collisions.
 */
export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  "id",
  "select",
  "insert",
  "update",
  "delete",
  "drop",
  "table",
  "from",
  "where",
  "join",
  "union",
  "exec",
  "execute",
  "script",
  "eval",
  "function",
  "constructor",
  "prototype",
  "__proto__",
  "class",
  "extends",
  "import",
  "export",
  "require",
  "module",
  "process",
  "global",
  "window",
  "document",
  "admin",
  "root",
  "system",
  "app",
  "appbuilder",
  "true",
  "false",
  "null",
  "undefined",
]);

/** Bounded MVP field types — see docs/appbuilder-schema.md#field-types. */
export const FIELD_TYPES = [
  "text",
  "longText",
  "integer",
  "decimal",
  "boolean",
  "date",
  "datetime",
  "select",
  "email",
  "url",
  "relation",
  "file",
  "image",
] as const;

/** Bounded relation delete behaviors — mirrors the safe subset Postgres supports. */
export const RELATION_DELETE_BEHAVIORS = ["restrict", "cascade", "setNull"] as const;

export const RELATION_CARDINALITIES = ["oneToOne", "oneToMany", "manyToMany"] as const;

/**
 * Bounded component kinds a page can reference. M06 adds a concrete
 * rendering registry for these — this list is the validation allowlist and
 * is extended by a schema-version bump, never silently.
 */
export const COMPONENT_KINDS = [
  "dataTable",
  "form",
  "detailView",
  "statWidget",
  "chartWidget",
  "buttonAction",
] as const;

/** Bounded action kinds — no arbitrary script/handler, only these primitives. */
export const ACTION_KINDS = [
  "createRecord",
  "updateRecord",
  "archiveRecord",
  "navigate",
  "runWorkflow",
] as const;

/** Bounded workflow step kinds — bounded primitives, never a free-form script body. */
export const WORKFLOW_STEP_KINDS = [
  "updateField",
  "sendNotification",
  "runAction",
  "condition",
] as const;

export const PERMISSION_EFFECTS = ["allow", "deny"] as const;

/** CRUD-shaped permission verbs a role can be granted per entity. */
export const PERMISSION_VERBS = ["create", "read", "update", "delete"] as const;
