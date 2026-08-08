import { describe, expect, it } from "vitest";
import type { ComponentConfigType } from "@asafarim/appbuilder-schema";
import { getRegistryEntryByTypeId, listRegistryEntries, resolveComponentEntry } from "./registry";
import { CONFIG_TABLE } from "./configTable";

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

  // configTable.ts is a hand-maintained, React-free duplicate of this
  // registry's (typeId, schemaKind, variant, configSchema) tuples, so that
  // @asafarim/appbuilder-ai's prompt guide (which needs the real config
  // schemas but must never pull in .tsx renderer components) can depend on
  // it directly. This guards against the two lists ever silently diverging.
  it("configTable.ts stays exactly in sync with the real registry entries", () => {
    const entries = listRegistryEntries();
    expect(CONFIG_TABLE.length).toBe(entries.length);

    for (const entry of entries) {
      const tableEntry = CONFIG_TABLE.find((t) => t.typeId === entry.typeId);
      expect(tableEntry, `configTable.ts is missing typeId "${entry.typeId}"`).toBeDefined();
      expect(tableEntry!.schemaKind).toBe(entry.schemaKind);
      expect(tableEntry!.variant).toBe(entry.variant);
      expect(tableEntry!.configSchema).toBe(entry.configSchema);
    }
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
