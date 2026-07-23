import { describe, expect, it } from "vitest";
import type { EntityType, FieldType } from "@asafarim/appbuilder-schema";
import { classifyEntityEvolution, classifyFieldEvolution } from "./schemaEvolution";

/**
 * Pure-logic unit tests for schemaEvolution.ts's field/entity evolution
 * classifier — safe vs requires_validation vs requires_migration vs
 * blocked. No database; checkExistingRecordsAgainstField (which does touch
 * the database) is covered by schemaEvolution.integration.test.ts.
 */

function textField(overrides: Partial<FieldType> = {}): FieldType {
  return {
    id: "name",
    machineName: "name",
    name: "Name",
    type: "text",
    required: false,
    unique: false,
    archived: false,
    ...overrides,
  } as FieldType;
}

describe("classifyFieldEvolution", () => {
  it("classifies a brand-new optional field as safe", () => {
    const report = classifyFieldEvolution(undefined, textField({ id: "nickname" }));
    expect(report.kind).toBe("safe");
    expect(report.fieldId).toBe("nickname");
  });

  it("classifies a brand-new required boolean field as safe (booleans always have a default)", () => {
    const report = classifyFieldEvolution(
      undefined,
      { id: "flag", machineName: "flag", name: "Flag", type: "boolean", required: true, unique: false, archived: false, defaultValue: false },
    );
    expect(report.kind).toBe("safe");
  });

  it("classifies a brand-new required non-boolean field as requires_validation", () => {
    const report = classifyFieldEvolution(undefined, textField({ id: "ssn", required: true }));
    expect(report.kind).toBe("requires_validation");
  });

  it("classifies a field archived (removed) as safe and recoverable", () => {
    const report = classifyFieldEvolution(textField({ id: "old" }), undefined);
    expect(report.kind).toBe("safe");
    expect(report.reason).toMatch(/recoverable/i);
  });

  it("classifies no field on either side as safe", () => {
    const report = classifyFieldEvolution(undefined, undefined);
    expect(report.kind).toBe("safe");
  });

  it("classifies a type change as requires_migration, never applied automatically", () => {
    const report = classifyFieldEvolution(textField({ type: "text" }), textField({ type: "integer" } as Partial<FieldType>));
    expect(report.kind).toBe("requires_migration");
  });

  it("classifies tightening a field to required as requires_validation", () => {
    const report = classifyFieldEvolution(textField({ required: false }), textField({ required: true }));
    expect(report.kind).toBe("requires_validation");
  });

  it("classifies tightening a field to unique as requires_validation", () => {
    const report = classifyFieldEvolution(textField({ unique: false }), textField({ unique: true }));
    expect(report.kind).toBe("requires_validation");
  });

  it("classifies removing a select option as requires_validation", () => {
    const oldField: FieldType = {
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
    } as FieldType;
    const newField: FieldType = { ...(oldField as any), options: [{ value: "open", label: "Open" }] };
    const report = classifyFieldEvolution(oldField, newField);
    expect(report.kind).toBe("requires_validation");
    expect(report.reason).toMatch(/closed/);
  });

  it("classifies adding a select option (no removal) as safe", () => {
    const oldField: FieldType = {
      id: "status",
      machineName: "status",
      name: "Status",
      type: "select",
      required: false,
      unique: false,
      archived: false,
      multiple: false,
      options: [{ value: "open", label: "Open" }],
    } as FieldType;
    const newField: FieldType = {
      ...(oldField as any),
      options: [
        { value: "open", label: "Open" },
        { value: "closed", label: "Closed" },
      ],
    };
    const report = classifyFieldEvolution(oldField, newField);
    expect(report.kind).toBe("safe");
  });

  it("classifies a display-only change (label/description) as safe", () => {
    const report = classifyFieldEvolution(textField({ name: "Name" }), textField({ name: "Full name" }));
    expect(report.kind).toBe("safe");
  });

  it("never returns 'blocked' — M09 has no automatic destructive migration path to gate", () => {
    // Every branch of classifyFieldEvolution should resolve to one of the
    // other three kinds; there is no code path that returns "blocked".
    const combos: Array<[FieldType | undefined, FieldType | undefined]> = [
      [undefined, textField()],
      [textField(), undefined],
      [textField({ type: "text" }), textField({ type: "longText" } as Partial<FieldType>)],
      [textField({ required: false }), textField({ required: true })],
      [textField({ unique: false }), textField({ unique: true })],
      [textField(), textField({ name: "Renamed" })],
    ];
    for (const [oldF, newF] of combos) {
      expect(classifyFieldEvolution(oldF, newF).kind).not.toBe("blocked");
    }
  });
});

function buildEntity(fields: FieldType[]): EntityType {
  return { id: "e", machineName: "e", name: "E", fields, indexes: [], archived: false };
}

describe("classifyEntityEvolution", () => {
  it("returns one report per union of old/new field ids", () => {
    const oldEntity = buildEntity([textField({ id: "a" }), textField({ id: "b" })]);
    const newEntity = buildEntity([textField({ id: "a" }), textField({ id: "c" })]);
    const reports = classifyEntityEvolution(oldEntity, newEntity);
    const ids = reports.map((r) => r.fieldId).sort();
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("returns an empty array when either entity is undefined", () => {
    expect(classifyEntityEvolution(undefined, buildEntity([]))).toEqual([]);
    expect(classifyEntityEvolution(buildEntity([]), undefined)).toEqual([]);
  });
});
