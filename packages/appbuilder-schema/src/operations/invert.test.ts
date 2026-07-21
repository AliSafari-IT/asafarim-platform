import { describe, expect, it } from "vitest";
import { applySpecOperation } from "./engine";
import { invertOperation } from "./invert";
import { Operation } from "./types";
import { constructionTaskManagementFixture } from "../fixtures";
import { OPERATION_SCHEMA_VERSION } from "../constants";
import { checksumOf } from "../canonical";

const base = constructionTaskManagementFixture;
const v = OPERATION_SCHEMA_VERSION;

describe("invertOperation — safe inverses", () => {
  it("inverts CREATE_ENTITY as ARCHIVE_ENTITY, restoring the original checksum's entity set", () => {
    const operation = Operation.parse({
      opVersion: v,
      type: "CREATE_ENTITY",
      entity: { id: "supplier", machineName: "supplier", name: "Supplier" },
    });
    const applied = applySpecOperation(base, operation, { confirmDestructive: true });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    const inverse = invertOperation(base, operation);
    expect(inverse).toEqual({ opVersion: v, type: "ARCHIVE_ENTITY", entityId: "supplier" });

    const undone = applySpecOperation(applied.spec, inverse, { confirmDestructive: true });
    expect(undone.ok).toBe(true);
    if (undone.ok) {
      expect(undone.spec.entities.find((e) => e.id === "supplier")?.archived).toBe(true);
    }
  });

  it("inverts UPDATE_ENTITY back to the prior name", () => {
    const operation = Operation.parse({
      opVersion: v,
      type: "UPDATE_ENTITY",
      entityId: "project",
      patch: { name: "Renamed Project" },
    });
    const inverse = invertOperation(base, operation);
    expect(inverse).toEqual({
      opVersion: v,
      type: "UPDATE_ENTITY",
      entityId: "project",
      patch: { name: base.entities[0].name, description: base.entities[0].description },
    });
  });

  it("fully round-trips REMOVE_COMPONENT via its inverse (ADD_COMPONENT restores the exact removed component)", () => {
    const operation = Operation.parse({
      opVersion: v,
      type: "REMOVE_COMPONENT",
      pageId: "projects",
      componentId: "project_form",
    });
    const applied = applySpecOperation(base, operation, { confirmDestructive: true });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    const inverse = invertOperation(base, operation);
    expect(inverse?.type).toBe("ADD_COMPONENT");

    const undone = applySpecOperation(applied.spec, inverse, { confirmDestructive: true });
    expect(undone.ok).toBe(true);
    if (undone.ok) {
      // Round-tripped back to the original checksum.
      expect(checksumOf(undone.spec)).toBe(checksumOf(base));
    }
  });

  it("fully round-trips UPDATE_NAVIGATION via its inverse", () => {
    const operation = Operation.parse({
      opVersion: v,
      type: "UPDATE_NAVIGATION",
      navigation: [{ id: "nav_dashboard", label: "Home", targetPageId: "dashboard", order: 0 }],
    });
    const applied = applySpecOperation(base, operation, { confirmDestructive: true });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    const inverse = invertOperation(base, operation);
    const undone = applySpecOperation(applied.spec, inverse, { confirmDestructive: true });
    expect(undone.ok).toBe(true);
    if (undone.ok) {
      expect(checksumOf(undone.spec)).toBe(checksumOf(base));
    }
  });
});

describe("invertOperation — no safe inverse exists", () => {
  it("returns null for ARCHIVE_ENTITY (no restore-entity operation exists)", () => {
    const operation = Operation.parse({ opVersion: v, type: "ARCHIVE_ENTITY", entityId: "project" });
    expect(invertOperation(base, operation)).toBeNull();
  });

  it("returns null for ARCHIVE_FIELD", () => {
    const operation = Operation.parse({ opVersion: v, type: "ARCHIVE_FIELD", entityId: "task", fieldId: "priority" });
    expect(invertOperation(base, operation)).toBeNull();
  });

  it("returns null for CREATE_ROLE (no archive-role operation exists)", () => {
    const operation = Operation.parse({ opVersion: v, type: "CREATE_ROLE", role: { id: "auditor", name: "Auditor" } });
    expect(invertOperation(base, operation)).toBeNull();
  });
});
