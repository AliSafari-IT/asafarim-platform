import { describe, expect, it } from "vitest";
import {
  DataTableConfigSchema,
  FiltersConfigSchema,
  KanbanConfigSchema,
  StatWidgetConfigSchema,
} from "./configSchemas";

describe("registry config schemas — strict, reject unknown keys", () => {
  it("dataTable accepts a valid config", () => {
    expect(DataTableConfigSchema.safeParse({ fieldIds: ["name"], pageSize: 10 }).success).toBe(true);
    expect(DataTableConfigSchema.safeParse({}).success).toBe(true);
  });

  it("dataTable rejects an unrecognized key", () => {
    const result = DataTableConfigSchema.safeParse({ fieldIds: ["name"], evilKey: "<script>alert(1)</script>" });
    expect(result.success).toBe(false);
  });

  it("kanban requires groupByFieldId and the literal variant", () => {
    expect(KanbanConfigSchema.safeParse({ variant: "kanban", groupByFieldId: "status" }).success).toBe(true);
    expect(KanbanConfigSchema.safeParse({ variant: "kanban" }).success).toBe(false);
    expect(KanbanConfigSchema.safeParse({ variant: "table", groupByFieldId: "status" }).success).toBe(false);
  });

  it("filters requires at least one filterable field id", () => {
    expect(FiltersConfigSchema.safeParse({ variant: "filters", filterableFieldIds: [] }).success).toBe(false);
    expect(FiltersConfigSchema.safeParse({ variant: "filters", filterableFieldIds: ["status"] }).success).toBe(true);
  });

  it("statWidget rejects an unrecognized metric", () => {
    expect(StatWidgetConfigSchema.safeParse({ metric: "count" }).success).toBe(true);
    expect(StatWidgetConfigSchema.safeParse({ metric: "median" }).success).toBe(false);
  });

  it("rejects a config carrying a real own '__proto__' key, since it isn't a declared schema key", () => {
    const withOwnProtoKey = JSON.parse('{"__proto__": {"polluted": true}}') as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(withOwnProtoKey, "__proto__")).toBe(true);
    expect(DataTableConfigSchema.safeParse(withOwnProtoKey).success).toBe(false);
  });
});
