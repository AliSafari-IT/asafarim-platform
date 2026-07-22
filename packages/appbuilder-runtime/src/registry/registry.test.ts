import { describe, expect, it } from "vitest";
import type { ComponentConfigType } from "@asafarim/appbuilder-schema";
import { getRegistryEntryByTypeId, listRegistryEntries, resolveComponentEntry } from "./registry";

function component(overrides: Partial<ComponentConfigType>): ComponentConfigType {
  return { id: "c1", kind: "dataTable", config: {}, order: 0, ...overrides };
}

describe("registry", () => {
  it("lists all 13 required page-component registry entries plus buttonAction", () => {
    const entries = listRegistryEntries();
    const typeIds = entries.map((entry) => entry.typeId).sort();
    expect(typeIds).toEqual(
      [
        "activityTimeline",
        "buttonAction",
        "calendarView",
        "chartWidget",
        "dataTable",
        "detailView",
        "emptyState",
        "filters",
        "fileField",
        "form",
        "kanbanBoard",
        "settingsPanel",
        "statWidget",
      ].sort(),
    );
  });

  it("every entry has a non-empty stable typeId, displayName, and version", () => {
    for (const entry of listRegistryEntries()) {
      expect(entry.typeId.length).toBeGreaterThan(0);
      expect(entry.displayName.length).toBeGreaterThan(0);
      expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("resolves the default variant when config.variant is absent", () => {
    const entry = resolveComponentEntry(component({ kind: "dataTable", config: {} }));
    expect(entry?.typeId).toBe("dataTable");
  });

  it("resolves a named variant sharing the same schema kind", () => {
    const entry = resolveComponentEntry(component({ kind: "dataTable", config: { variant: "kanban", groupByFieldId: "status" } }));
    expect(entry?.typeId).toBe("kanbanBoard");
  });

  it("returns undefined for an unregistered variant of a known kind", () => {
    const entry = resolveComponentEntry(component({ kind: "dataTable", config: { variant: "nonsense" } }));
    expect(entry).toBeUndefined();
  });

  it("looks up an entry by its stable typeId", () => {
    expect(getRegistryEntryByTypeId("kanbanBoard")?.schemaKind).toBe("dataTable");
    expect(getRegistryEntryByTypeId("does-not-exist")).toBeUndefined();
  });
});
