import { describe, expect, it } from "vitest";
import { emptySpecification, type ApplicationSpecificationType, type EntityType, type FieldType } from "@asafarim/appbuilder-schema";
import {
  findEntity,
  normalizeForUniqueness,
  PROTECTED_SYSTEM_FIELD_NAMES,
  relationFieldIds,
  uniqueFieldIds,
  UnknownEntityError,
  validateFieldValue,
  validateRecordData,
} from "./validation";

/**
 * Pure-logic unit tests for validation.ts — no database. Covers every
 * FieldType's validateFieldValue rules and validateRecordData's
 * required/unknown-field/protected-field/entity-resolution behavior.
 */

const KITCHEN_SINK_ENTITY: EntityType = {
  id: "kitchen_sink",
  machineName: "kitchen_sink",
  name: "Kitchen Sink",
  fields: [
    { id: "title", machineName: "title", name: "Title", type: "text", required: true, unique: false, archived: false, maxLength: 20 },
    { id: "notes", machineName: "notes", name: "Notes", type: "longText", required: false, unique: false, archived: false, maxLength: 50 },
    { id: "count", machineName: "count", name: "Count", type: "integer", required: false, unique: false, archived: false, min: 0, max: 10 },
    { id: "amount", machineName: "amount", name: "Amount", type: "decimal", required: false, unique: false, archived: false, min: 0, max: 100, decimalPlaces: 2 },
    { id: "active", machineName: "active", name: "Active", type: "boolean", required: false, unique: false, archived: false, defaultValue: true },
    { id: "start_date", machineName: "start_date", name: "Start date", type: "date", required: false, unique: false, archived: false },
    { id: "starts_at", machineName: "starts_at", name: "Starts at", type: "datetime", required: false, unique: false, archived: false },
    {
      id: "status",
      machineName: "status",
      name: "Status",
      type: "select",
      required: false,
      unique: false,
      archived: false,
      multiple: false,
      options: [
        { value: "open", label: "Open" },
        { value: "closed", label: "Closed" },
      ],
    },
    {
      id: "tags",
      machineName: "tags",
      name: "Tags",
      type: "select",
      required: false,
      unique: false,
      archived: false,
      multiple: true,
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    },
    { id: "email", machineName: "email", name: "Email", type: "email", required: false, unique: true, archived: false },
    { id: "website", machineName: "website", name: "Website", type: "url", required: false, unique: false, archived: false },
    { id: "parent_ref", machineName: "parent_ref", name: "Parent", type: "relation", required: false, unique: false, archived: false, relationId: "kitchen_sink_parent" },
    { id: "attachment", machineName: "attachment", name: "Attachment", type: "file", required: false, unique: false, archived: false },
    { id: "photo", machineName: "photo", name: "Photo", type: "image", required: false, unique: false, archived: false },
    { id: "archived_field", machineName: "archived_field", name: "Archived field", type: "text", required: false, unique: false, archived: true },
  ],
  indexes: [],
  archived: false,
};

function buildSpec(entities: EntityType[]): ApplicationSpecificationType {
  const spec = emptySpecification({ name: "Validation Test App", slug: "validation-test-app" });
  return { ...spec, entities };
}

const SPEC = buildSpec([KITCHEN_SINK_ENTITY]);

function fieldOf(id: string): FieldType {
  const field = KITCHEN_SINK_ENTITY.fields.find((f) => f.id === id);
  if (!field) throw new Error(`test setup: no such field "${id}"`);
  return field;
}

describe("findEntity", () => {
  it("resolves a known, non-archived entity", () => {
    expect(findEntity(SPEC, "kitchen_sink").id).toBe("kitchen_sink");
  });

  it("throws UnknownEntityError for an unknown entity id", () => {
    expect(() => findEntity(SPEC, "nope")).toThrow(UnknownEntityError);
  });

  it("treats an archived entity as not found", () => {
    const archivedSpec = buildSpec([{ ...KITCHEN_SINK_ENTITY, archived: true }]);
    expect(() => findEntity(archivedSpec, "kitchen_sink")).toThrow(UnknownEntityError);
  });
});

describe("validateFieldValue: text/longText", () => {
  it("accepts a valid string within maxLength", () => {
    expect(validateFieldValue(fieldOf("title"), "Hello")).toBeNull();
  });

  it("rejects a non-string value", () => {
    expect(validateFieldValue(fieldOf("title"), 123)?.code).toBe("invalid_type");
  });

  it("rejects a string exceeding maxLength", () => {
    expect(validateFieldValue(fieldOf("title"), "x".repeat(21))?.code).toBe("too_long");
  });

  it("rejects unsafe content (script tag)", () => {
    expect(validateFieldValue(fieldOf("notes"), "<script>alert(1)</script>")?.code).toBe("unsafe_content");
  });

  it("rejects unsafe content (SQL injection shape)", () => {
    expect(validateFieldValue(fieldOf("notes"), "'; DROP TABLE users; --")?.code).toBe("unsafe_content");
  });
});

describe("validateFieldValue: integer", () => {
  it("accepts an in-range integer", () => {
    expect(validateFieldValue(fieldOf("count"), 5)).toBeNull();
  });

  it("rejects a non-integer number", () => {
    expect(validateFieldValue(fieldOf("count"), 5.5)?.code).toBe("invalid_type");
  });

  it("rejects a value below min", () => {
    expect(validateFieldValue(fieldOf("count"), -1)?.code).toBe("out_of_range");
  });

  it("rejects a value above max", () => {
    expect(validateFieldValue(fieldOf("count"), 11)?.code).toBe("out_of_range");
  });
});

describe("validateFieldValue: decimal", () => {
  it("accepts an in-range decimal", () => {
    expect(validateFieldValue(fieldOf("amount"), 12.34)).toBeNull();
  });

  it("rejects a non-number", () => {
    expect(validateFieldValue(fieldOf("amount"), "12.34")?.code).toBe("invalid_type");
  });

  it("rejects NaN", () => {
    expect(validateFieldValue(fieldOf("amount"), Number.NaN)?.code).toBe("invalid_type");
  });

  it("rejects below min / above max", () => {
    expect(validateFieldValue(fieldOf("amount"), -0.01)?.code).toBe("out_of_range");
    expect(validateFieldValue(fieldOf("amount"), 100.01)?.code).toBe("out_of_range");
  });
});

describe("validateFieldValue: boolean", () => {
  it("accepts true/false", () => {
    expect(validateFieldValue(fieldOf("active"), true)).toBeNull();
    expect(validateFieldValue(fieldOf("active"), false)).toBeNull();
  });

  it("rejects a non-boolean", () => {
    expect(validateFieldValue(fieldOf("active"), "true")?.code).toBe("invalid_type");
  });
});

describe("validateFieldValue: date", () => {
  it("accepts YYYY-MM-DD", () => {
    expect(validateFieldValue(fieldOf("start_date"), "2026-08-01")).toBeNull();
  });

  it("rejects a datetime string (wrong format for a pure date field)", () => {
    expect(validateFieldValue(fieldOf("start_date"), "2026-08-01T00:00:00Z")?.code).toBe("invalid_type");
  });

  it("rejects a nonsensical date", () => {
    expect(validateFieldValue(fieldOf("start_date"), "2026-13-40")?.code).toBe("invalid_type");
  });
});

describe("validateFieldValue: datetime", () => {
  it("accepts a valid ISO datetime string", () => {
    expect(validateFieldValue(fieldOf("starts_at"), "2026-08-01T10:00:00.000Z")).toBeNull();
  });

  it("rejects an invalid datetime string", () => {
    expect(validateFieldValue(fieldOf("starts_at"), "not-a-date")?.code).toBe("invalid_type");
  });
});

describe("validateFieldValue: select (single)", () => {
  it("accepts a defined option", () => {
    expect(validateFieldValue(fieldOf("status"), "open")).toBeNull();
  });

  it("rejects an undefined option", () => {
    expect(validateFieldValue(fieldOf("status"), "nonexistent")?.code).toBe("invalid_select_value");
  });

  it("rejects an array value on a non-multiple select", () => {
    expect(validateFieldValue(fieldOf("status"), ["open"])?.code).toBe("invalid_select_value");
  });
});

describe("validateFieldValue: select (multiple)", () => {
  it("accepts an array of defined options", () => {
    expect(validateFieldValue(fieldOf("tags"), ["a", "b"])).toBeNull();
  });

  it("accepts an empty array", () => {
    expect(validateFieldValue(fieldOf("tags"), [])).toBeNull();
  });

  it("rejects an array containing an undefined option", () => {
    expect(validateFieldValue(fieldOf("tags"), ["a", "nope"])?.code).toBe("invalid_select_value");
  });

  it("rejects a non-array value", () => {
    expect(validateFieldValue(fieldOf("tags"), "a")?.code).toBe("invalid_select_value");
  });
});

describe("validateFieldValue: email", () => {
  it("accepts a valid email", () => {
    expect(validateFieldValue(fieldOf("email"), "a@b.com")).toBeNull();
  });

  it("rejects a malformed email", () => {
    expect(validateFieldValue(fieldOf("email"), "not-an-email")?.code).toBe("invalid_type");
  });

  it("rejects an overlong email", () => {
    const longLocal = "a".repeat(315);
    expect(validateFieldValue(fieldOf("email"), `${longLocal}@b.com`)?.code).toBe("invalid_type");
  });
});

describe("validateFieldValue: url", () => {
  it("accepts http/https URLs", () => {
    expect(validateFieldValue(fieldOf("website"), "https://example.com")).toBeNull();
    expect(validateFieldValue(fieldOf("website"), "http://example.com")).toBeNull();
  });

  it("rejects a javascript: URL", () => {
    expect(validateFieldValue(fieldOf("website"), "javascript:alert(1)")?.code).toBe("unsafe_url");
  });

  it("rejects a non-URL string", () => {
    expect(validateFieldValue(fieldOf("website"), "not a url")?.code).toBe("unsafe_url");
  });

  it("rejects an ftp: URL (not http/https)", () => {
    expect(validateFieldValue(fieldOf("website"), "ftp://example.com/file")?.code).toBe("unsafe_url");
  });
});

describe("validateFieldValue: relation", () => {
  it("accepts a non-empty id string", () => {
    expect(validateFieldValue(fieldOf("parent_ref"), "rec_123")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(validateFieldValue(fieldOf("parent_ref"), "")?.code).toBe("invalid_relation");
  });

  it("rejects an overlong id", () => {
    expect(validateFieldValue(fieldOf("parent_ref"), "x".repeat(101))?.code).toBe("invalid_relation");
  });

  it("rejects a non-string value", () => {
    expect(validateFieldValue(fieldOf("parent_ref"), 123)?.code).toBe("invalid_relation");
  });
});

describe("validateFieldValue: file/image", () => {
  it("accepts a { fileId } structural reference", () => {
    expect(validateFieldValue(fieldOf("attachment"), { fileId: "file_123" })).toBeNull();
    expect(validateFieldValue(fieldOf("photo"), { fileId: "file_456" })).toBeNull();
  });

  it("rejects a value missing fileId", () => {
    expect(validateFieldValue(fieldOf("attachment"), {})?.code).toBe("invalid_file_reference");
  });

  it("rejects a bare string", () => {
    expect(validateFieldValue(fieldOf("attachment"), "file_123")?.code).toBe("invalid_file_reference");
  });

  it("rejects null-ish shapes", () => {
    expect(validateFieldValue(fieldOf("attachment"), { fileId: 123 })?.code).toBe("invalid_file_reference");
  });
});

describe("validateRecordData", () => {
  it("accepts a fully valid create payload", () => {
    const result = validateRecordData(SPEC, "kitchen_sink", { title: "Hi", count: 3 }, { partial: false });
    expect(result.ok).toBe(true);
  });

  it("rejects an unknown entity id", () => {
    expect(() => validateRecordData(SPEC, "nope", {}, { partial: false })).toThrow(UnknownEntityError);
  });

  it("rejects an unknown field", () => {
    const result = validateRecordData(SPEC, "kitchen_sink", { title: "Hi", bogus: "x" }, { partial: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.code === "unknown_field" && e.field === "bogus")).toBe(true);
  });

  it("rejects every PROTECTED_SYSTEM_FIELD_NAMES key that has no corresponding entity field, even alongside otherwise-valid data", () => {
    // KITCHEN_SINK_ENTITY intentionally defines its own "status" field (to
    // double as the collision regression fixture below) — skip it here and
    // cover it in the dedicated test instead.
    for (const protectedField of PROTECTED_SYSTEM_FIELD_NAMES) {
      if (protectedField === "status") continue;
      const result = validateRecordData(SPEC, "kitchen_sink", { title: "Hi", [protectedField]: "smuggled" }, { partial: false });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.code === "protected_field" && e.field === protectedField)).toBe(true);
      }
    }
  });

  it("accepts a value for a protected-sounding name when the entity legitimately defines a field with that id (e.g. a business 'status' field) — it is only ever written into the data column, never the row's own system columns", () => {
    // Regression coverage for a real production bug: the task_management
    // starter template defines an ordinary "status" select field on both
    // `project` and `task` (see packages/appbuilder-runtime/src/templates/
    // taskManagement.ts), which collides by name with the row-level
    // generatedRecords.status column PROTECTED_SYSTEM_FIELD_NAMES guards.
    // An entity-defined field must win — see validateRecordData's comment.
    const statusEntity: EntityType = {
      id: "status_entity",
      machineName: "status_entity",
      name: "Status Entity",
      fields: [
        {
          id: "status",
          machineName: "status",
          name: "Status",
          type: "select",
          required: true,
          unique: false,
          archived: false,
          multiple: false,
          options: [
            { value: "todo", label: "To do" },
            { value: "done", label: "Done" },
          ],
        },
      ],
      indexes: [],
      archived: false,
    };
    const spec = buildSpec([statusEntity]);
    const result = validateRecordData(spec, "status_entity", { status: "todo" }, { partial: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("todo");
  });

  it("rejects a create payload missing a required field", () => {
    const result = validateRecordData(SPEC, "kitchen_sink", {}, { partial: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.code === "required" && e.field === "title")).toBe(true);
  });

  it("does not require missing fields on a partial (update) payload", () => {
    const result = validateRecordData(SPEC, "kitchen_sink", { count: 4 }, { partial: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ count: 4 });
  });

  it("applies a boolean field's default value on create when omitted", () => {
    const result = validateRecordData(SPEC, "kitchen_sink", { title: "Hi" }, { partial: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.active).toBe(true);
  });

  it("does not backfill a boolean default on a partial update", () => {
    const result = validateRecordData(SPEC, "kitchen_sink", { title: "Hi" }, { partial: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect("active" in result.data).toBe(false);
  });

  it("accepts an explicit null for a non-required field", () => {
    const result = validateRecordData(SPEC, "kitchen_sink", { title: "Hi", count: null }, { partial: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.count).toBeNull();
  });

  it("rejects an explicit null for a required field", () => {
    const result = validateRecordData(SPEC, "kitchen_sink", { title: null }, { partial: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.code === "required" && e.field === "title")).toBe(true);
  });

  it("rejects a value against an archived field as unknown (archived fields are excluded)", () => {
    const result = validateRecordData(SPEC, "kitchen_sink", { title: "Hi", archived_field: "x" }, { partial: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.field === "archived_field" && e.code === "unknown_field")).toBe(true);
  });

  it("collects multiple validation errors in one pass", () => {
    const result = validateRecordData(SPEC, "kitchen_sink", { title: "x".repeat(30), count: -5 }, { partial: false });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      expect(result.errors.some((e) => e.field === "title")).toBe(true);
      expect(result.errors.some((e) => e.field === "count")).toBe(true);
    }
  });
});

describe("uniqueFieldIds", () => {
  it("returns only non-archived unique field ids", () => {
    expect(uniqueFieldIds(KITCHEN_SINK_ENTITY)).toEqual(["email"]);
  });
});

describe("relationFieldIds", () => {
  it("returns relation fields with their relationId", () => {
    expect(relationFieldIds(KITCHEN_SINK_ENTITY)).toEqual([{ fieldId: "parent_ref", relationId: "kitchen_sink_parent" }]);
  });
});

describe("normalizeForUniqueness", () => {
  it("trims and lowercases text-like fields", () => {
    expect(normalizeForUniqueness(fieldOf("email"), "  Foo@Bar.com  ")).toBe("foo@bar.com");
  });

  it("JSON-stringifies non-text-like fields", () => {
    expect(normalizeForUniqueness(fieldOf("count"), 5)).toBe("5");
  });
});
