import {
  isContentSafe,
  type ApplicationSpecificationType,
  type EntityType,
  type FieldType,
} from "@asafarim/appbuilder-schema";

/**
 * Typed validation of a generated record's field values against the
 * PINNED application specification's entity/field definitions — the only
 * place a client-supplied record payload is ever trusted, and only after
 * passing through here. Mirrors @asafarim/appbuilder-schema's own
 * `{ ok: true, ... } | { ok: false, errors }` outcome convention (M04) so
 * callers use one familiar shape across the whole spec/data boundary.
 */

export interface ValidationIssue {
  field: string;
  code: string;
  message: string;
}

export type RecordValidationResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; errors: ValidationIssue[] };

/**
 * Columns that are ALWAYS server-managed and may never be set via a
 * record's `data` payload, regardless of role/permission — id, ownership,
 * revision, and timestamps live as their own `generatedRecords` columns
 * (see lib/db/schema.ts), never inside `data` at all, but a client could
 * still try to smuggle a same-named key into the payload; this list is the
 * reject-on-sight guard for that.
 */
export const PROTECTED_SYSTEM_FIELD_NAMES: ReadonlySet<string> = new Set([
  "id",
  "appId",
  "entityId",
  "revision",
  "status",
  "createdAt",
  "updatedAt",
  "createdByPrincipalId",
  "updatedByPrincipalId",
  "archivedAt",
  "specVersionNumber",
]);

export class UnknownEntityError extends Error {
  constructor(entityId: string) {
    super(`Entity "${entityId}" does not exist in the app's current specification.`);
    this.name = "UnknownEntityError";
  }
}

export function findEntity(spec: ApplicationSpecificationType, entityId: string): EntityType {
  const entity = spec.entities.find((e) => e.id === entityId && !e.archived);
  if (!entity) throw new UnknownEntityError(entityId);
  return entity;
}

function isSafeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Exported for schemaEvolution.ts's read-only "would this existing value still pass?" checks — not used for normal record writes (validateRecordData is). */
export function validateFieldValue(field: FieldType, value: unknown): ValidationIssue | null {
  const label = field.id;

  switch (field.type) {
    case "text":
    case "longText": {
      if (typeof value !== "string") return { field: label, code: "invalid_type", message: `"${label}" must be a string.` };
      if (field.maxLength && value.length > field.maxLength) {
        return { field: label, code: "too_long", message: `"${label}" exceeds its maximum length of ${field.maxLength}.` };
      }
      if (!isContentSafe(value)) {
        return { field: label, code: "unsafe_content", message: `"${label}" contains disallowed content.` };
      }
      return null;
    }
    case "integer": {
      if (!Number.isInteger(value)) return { field: label, code: "invalid_type", message: `"${label}" must be an integer.` };
      const n = value as number;
      if (field.min !== undefined && n < field.min) return { field: label, code: "out_of_range", message: `"${label}" is below its minimum.` };
      if (field.max !== undefined && n > field.max) return { field: label, code: "out_of_range", message: `"${label}" exceeds its maximum.` };
      return null;
    }
    case "decimal": {
      if (typeof value !== "number" || Number.isNaN(value)) return { field: label, code: "invalid_type", message: `"${label}" must be a number.` };
      if (field.min !== undefined && value < field.min) return { field: label, code: "out_of_range", message: `"${label}" is below its minimum.` };
      if (field.max !== undefined && value > field.max) return { field: label, code: "out_of_range", message: `"${label}" exceeds its maximum.` };
      return null;
    }
    case "boolean":
      return typeof value === "boolean" ? null : { field: label, code: "invalid_type", message: `"${label}" must be a boolean.` };
    case "date":
      return typeof value === "string" && DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value))
        ? null
        : { field: label, code: "invalid_type", message: `"${label}" must be a date in YYYY-MM-DD format.` };
    case "datetime":
      return typeof value === "string" && !Number.isNaN(Date.parse(value))
        ? null
        : { field: label, code: "invalid_type", message: `"${label}" must be a valid ISO datetime string.` };
    case "select": {
      const allowed = new Set(field.options.map((o) => o.value));
      if (field.multiple) {
        if (!Array.isArray(value) || !value.every((v) => typeof v === "string" && allowed.has(v))) {
          return { field: label, code: "invalid_select_value", message: `"${label}" contains an option not defined on this field.` };
        }
        return null;
      }
      return typeof value === "string" && allowed.has(value)
        ? null
        : { field: label, code: "invalid_select_value", message: `"${label}" is not one of this field's defined options.` };
    }
    case "email":
      return typeof value === "string" && EMAIL_PATTERN.test(value) && value.length <= 320
        ? null
        : { field: label, code: "invalid_type", message: `"${label}" must be a valid email address.` };
    case "url":
      return typeof value === "string" && isSafeUrl(value)
        ? null
        : { field: label, code: "unsafe_url", message: `"${label}" must be an http(s) URL.` };
    case "relation":
      // Structural check only — the referenced record's existence, app
      // scope, and accessibility are validated by relations.ts (requires a
      // DB round trip this pure function deliberately does not make).
      return typeof value === "string" && value.length > 0 && value.length <= 100
        ? null
        : { field: label, code: "invalid_relation", message: `"${label}" must reference a record id.` };
    case "file":
    case "image":
      // Structural check only — { fileId: string } — file existence/
      // ownership/commit-state is validated by files.ts.
      return value && typeof value === "object" && typeof (value as { fileId?: unknown }).fileId === "string"
        ? null
        : { field: label, code: "invalid_file_reference", message: `"${label}" must reference an uploaded file.` };
    default:
      return { field: label, code: "invalid_type", message: `"${label}" has an unrecognized field type.` };
  }
}

export interface ValidateRecordDataOptions {
  /** true for an update (only supplied keys are checked); false for a create (every non-optional field must be present). */
  partial: boolean;
}

/**
 * Validates a record payload against one entity's field definitions.
 * Rejects unknown fields/entities, protected system-field keys, invalid
 * types/ranges/options, unsafe content/URLs — never accepts an unvalidated
 * value into `generatedRecords.data`. Does not touch the database — relation
 * target existence and uniqueness are validated by relations.ts/records.ts,
 * which have DB access this pure function deliberately does not.
 */
export function validateRecordData(
  spec: ApplicationSpecificationType,
  entityId: string,
  input: Record<string, unknown>,
  options: ValidateRecordDataOptions,
): RecordValidationResult {
  const entity = findEntity(spec, entityId);
  const errors: ValidationIssue[] = [];
  const fieldsById = new Map(entity.fields.filter((f) => !f.archived).map((f) => [f.id, f]));

  for (const key of Object.keys(input)) {
    // A field the entity's OWN (server-controlled) specification legitimately
    // defines always wins over the protected-name guard below — the task
    // management template, for one, defines a perfectly ordinary "status"
    // field on `project`/`task`, which collides by name with the row-level
    // `generatedRecords.status` column. That collision is harmless: this
    // value is only ever written into the `data` JSONB column (never the
    // row's real id/status/revision/etc. columns, which records.ts always
    // sets itself, never from `validation.data`), so an entity-defined field
    // is validated normally instead of being rejected outright. The guard
    // still applies to any key NOT defined on the entity, which is the only
    // case where a client could otherwise smuggle a same-named key with no
    // corresponding field definition to validate it.
    if (fieldsById.has(key)) continue;
    if (PROTECTED_SYSTEM_FIELD_NAMES.has(key)) {
      errors.push({ field: key, code: "protected_field", message: `"${key}" is a system-managed field and cannot be set directly.` });
      continue;
    }
    errors.push({ field: key, code: "unknown_field", message: `"${key}" is not a defined field on entity "${entityId}".` });
  }

  const data: Record<string, unknown> = {};
  for (const field of fieldsById.values()) {
    const provided = Object.prototype.hasOwnProperty.call(input, field.id);
    if (!provided) {
      if (!options.partial && field.required && !(field.type === "boolean")) {
        errors.push({ field: field.id, code: "required", message: `"${field.id}" is required.` });
      }
      if (field.type === "boolean" && !options.partial) {
        data[field.id] = field.defaultValue;
      }
      continue;
    }

    const value = input[field.id];
    if (value === null || value === undefined) {
      if (field.required) {
        errors.push({ field: field.id, code: "required", message: `"${field.id}" is required.` });
      }
      data[field.id] = null;
      continue;
    }

    const issue = validateFieldValue(field, value);
    if (issue) {
      errors.push(issue);
      continue;
    }
    data[field.id] = value;
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data };
}

/** Field ids on this entity that must be enforced unique — for records.ts's uniqueness-claim bookkeeping. */
export function uniqueFieldIds(entity: EntityType): string[] {
  return entity.fields.filter((f) => !f.archived && f.unique).map((f) => f.id);
}

/** Field ids on this entity that are relation-typed — for relations.ts's edge maintenance. */
export function relationFieldIds(entity: EntityType): Array<{ fieldId: string; relationId: string }> {
  return entity.fields
    .filter((f): f is Extract<FieldType, { type: "relation" }> => !f.archived && f.type === "relation")
    .map((f) => ({ fieldId: f.id, relationId: f.relationId }));
}

/** Normalizes a field value into a stable string for uniqueness hashing — case/whitespace-insensitive for text-like types. */
export function normalizeForUniqueness(field: FieldType, value: unknown): string {
  if (field.type === "text" || field.type === "email" || field.type === "url") {
    return String(value).trim().toLowerCase();
  }
  return JSON.stringify(value);
}
