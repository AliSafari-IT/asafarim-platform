import { describe, expect, it } from "vitest";
import { applySpecOperation } from "./engine";
import { diffSpecifications } from "./diff";
import { constructionTaskManagementFixture } from "../fixtures";
import { OPERATION_SCHEMA_VERSION } from "../constants";

const base = constructionTaskManagementFixture;
const v = OPERATION_SCHEMA_VERSION;

describe("diffSpecifications", () => {
  it("reports no entries for identical specs", () => {
    const diff = diffSpecifications(base, base);
    expect(diff.entries).toEqual([]);
  });

  it("reports an added entity", () => {
    const outcome = applySpecOperation(
      base,
      { opVersion: v, type: "CREATE_ENTITY", entity: { id: "supplier", machineName: "supplier", name: "Supplier" } },
      { confirmDestructive: true },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const diff = diffSpecifications(base, outcome.spec);
    expect(diff.entries).toContainEqual(
      expect.objectContaining({ path: ["entities", "supplier"], kind: "added" }),
    );
  });

  it("reports a removed permission", () => {
    const outcome = applySpecOperation(
      base,
      { opVersion: v, type: "REMOVE_PERMISSION", permissionId: "perm_employee_task_update" },
      { confirmDestructive: true },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const diff = diffSpecifications(base, outcome.spec);
    expect(diff.entries).toContainEqual(
      expect.objectContaining({ path: ["permissions", "perm_employee_task_update"], kind: "removed" }),
    );
  });

  it("reports a changed field nested under its entity", () => {
    const outcome = applySpecOperation(
      base,
      { opVersion: v, type: "UPDATE_FIELD", entityId: "task", fieldId: "title", patch: { required: true, unique: true } },
      { confirmDestructive: true },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const diff = diffSpecifications(base, outcome.spec);
    expect(diff.entries).toContainEqual(
      expect.objectContaining({ path: ["entities", "task", "fields", "title"], kind: "changed" }),
    );
  });

  it("reports a branding change", () => {
    const outcome = applySpecOperation(
      base,
      { opVersion: v, type: "UPDATE_BRANDING", patch: { primaryColor: "#000000" } },
      { confirmDestructive: true },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const diff = diffSpecifications(base, outcome.spec);
    expect(diff.entries).toContainEqual(expect.objectContaining({ path: ["branding"], kind: "changed" }));
  });
});
