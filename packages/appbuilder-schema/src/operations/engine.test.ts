import { describe, expect, it } from "vitest";
import { applySpecOperation } from "./engine";
import { checksumOf } from "../canonical";
import { constructionTaskManagementFixture } from "../fixtures";
import type { ApplicationSpecificationType } from "../specification";
import { OPERATION_SCHEMA_VERSION } from "../constants";

const base = constructionTaskManagementFixture;
const v = OPERATION_SCHEMA_VERSION;

function expectSuccess(spec: ApplicationSpecificationType, op: unknown) {
  const outcome = applySpecOperation(spec, op, { confirmDestructive: true });
  if (!outcome.ok) {
    throw new Error(`Expected success, got errors: ${JSON.stringify(outcome.errors)}`);
  }
  return outcome;
}

describe("applySpecOperation — every operation type", () => {
  it("CREATE_ENTITY adds a new entity", () => {
    const outcome = expectSuccess(base, {
      opVersion: v,
      type: "CREATE_ENTITY",
      entity: { id: "supplier", machineName: "supplier", name: "Supplier" },
    });
    expect(outcome.spec.entities.some((e) => e.id === "supplier")).toBe(true);
  });

  it("UPDATE_ENTITY renames an entity", () => {
    const outcome = expectSuccess(base, {
      opVersion: v,
      type: "UPDATE_ENTITY",
      entityId: "project",
      patch: { name: "Construction Project" },
    });
    expect(outcome.spec.entities.find((e) => e.id === "project")?.name).toBe("Construction Project");
  });

  it("ARCHIVE_ENTITY marks an entity archived", () => {
    const outcome = expectSuccess(base, { opVersion: v, type: "ARCHIVE_ENTITY", entityId: "employee" });
    expect(outcome.spec.entities.find((e) => e.id === "employee")?.archived).toBe(true);
  });

  it("ADD_FIELD adds a field to an entity", () => {
    const outcome = expectSuccess(base, {
      opVersion: v,
      type: "ADD_FIELD",
      entityId: "project",
      field: { id: "budget", machineName: "budget", name: "Budget", type: "decimal", required: false, unique: false, archived: false },
    });
    expect(outcome.spec.entities.find((e) => e.id === "project")?.fields.some((f) => f.id === "budget")).toBe(true);
  });

  it("UPDATE_FIELD changes a field's editable properties", () => {
    const outcome = expectSuccess(base, {
      opVersion: v,
      type: "UPDATE_FIELD",
      entityId: "task",
      fieldId: "title",
      patch: { required: true, unique: true },
    });
    const field = outcome.spec.entities.find((e) => e.id === "task")?.fields.find((f) => f.id === "title");
    expect(field?.unique).toBe(true);
  });

  it("ARCHIVE_FIELD marks a field archived", () => {
    const outcome = expectSuccess(base, { opVersion: v, type: "ARCHIVE_FIELD", entityId: "task", fieldId: "priority" });
    const field = outcome.spec.entities.find((e) => e.id === "task")?.fields.find((f) => f.id === "priority");
    expect(field?.archived).toBe(true);
  });

  it("CREATE_RELATION adds a new relation", () => {
    const outcome = expectSuccess(base, {
      opVersion: v,
      type: "CREATE_RELATION",
      relation: {
        id: "project_manager",
        name: "Project managed by Employee",
        fromEntityId: "project",
        toEntityId: "employee",
        cardinality: "oneToMany",
        onDelete: "setNull",
      },
    });
    expect(outcome.spec.relations.some((r) => r.id === "project_manager")).toBe(true);
  });

  it("UPDATE_RELATION changes a relation's editable properties", () => {
    const outcome = expectSuccess(base, {
      opVersion: v,
      type: "UPDATE_RELATION",
      relationId: "task_assignee",
      patch: { name: "Assigned employee" },
    });
    expect(outcome.spec.relations.find((r) => r.id === "task_assignee")?.name).toBe("Assigned employee");
  });

  it("ARCHIVE_RELATION marks a relation archived", () => {
    const outcome = expectSuccess(base, { opVersion: v, type: "ARCHIVE_RELATION", relationId: "task_assignee" });
    expect(outcome.spec.relations.find((r) => r.id === "task_assignee")?.archived).toBe(true);
  });

  it("CREATE_PAGE adds a new page", () => {
    const outcome = expectSuccess(base, {
      opVersion: v,
      type: "CREATE_PAGE",
      page: { id: "reports", name: "Reports", path: "reports" },
    });
    expect(outcome.spec.pages.some((p) => p.id === "reports")).toBe(true);
  });

  it("UPDATE_PAGE renames a page", () => {
    const outcome = expectSuccess(base, {
      opVersion: v,
      type: "UPDATE_PAGE",
      pageId: "team",
      patch: { name: "Team & Settings" },
    });
    expect(outcome.spec.pages.find((p) => p.id === "team")?.name).toBe("Team & Settings");
  });

  it("ARCHIVE_PAGE marks a page archived", () => {
    const outcome = expectSuccess(base, { opVersion: v, type: "ARCHIVE_PAGE", pageId: "team" });
    expect(outcome.spec.pages.find((p) => p.id === "team")?.archived).toBe(true);
  });

  it("ADD_COMPONENT adds a component to a page", () => {
    const outcome = expectSuccess(base, {
      opVersion: v,
      type: "ADD_COMPONENT",
      pageId: "dashboard",
      component: { id: "welcome_banner", kind: "statWidget", config: {}, order: 0 },
    });
    expect(outcome.spec.pages.find((p) => p.id === "dashboard")?.components.some((c) => c.id === "welcome_banner")).toBe(
      true,
    );
  });

  it("UPDATE_COMPONENT changes a component's config", () => {
    const outcome = expectSuccess(base, {
      opVersion: v,
      type: "UPDATE_COMPONENT",
      pageId: "projects",
      componentId: "projects_table",
      patch: { config: { pageSize: 25 } },
    });
    const component = outcome.spec.pages.find((p) => p.id === "projects")?.components.find((c) => c.id === "projects_table");
    expect(component?.config).toEqual({ pageSize: 25 });
  });

  it("MOVE_COMPONENT changes a component's order", () => {
    const outcome = expectSuccess(base, {
      opVersion: v,
      type: "MOVE_COMPONENT",
      pageId: "projects",
      componentId: "project_form",
      newOrder: 5,
    });
    const component = outcome.spec.pages.find((p) => p.id === "projects")?.components.find((c) => c.id === "project_form");
    expect(component?.order).toBe(5);
  });

  it("REMOVE_COMPONENT removes a component", () => {
    const outcome = expectSuccess(base, { opVersion: v, type: "REMOVE_COMPONENT", pageId: "projects", componentId: "project_form" });
    expect(outcome.spec.pages.find((p) => p.id === "projects")?.components.some((c) => c.id === "project_form")).toBe(
      false,
    );
  });

  it("UPDATE_NAVIGATION replaces the navigation list", () => {
    const outcome = expectSuccess(base, {
      opVersion: v,
      type: "UPDATE_NAVIGATION",
      navigation: [{ id: "nav_dashboard", label: "Home", targetPageId: "dashboard", order: 0 }],
    });
    expect(outcome.spec.navigation).toHaveLength(1);
    expect(outcome.spec.navigation[0].label).toBe("Home");
  });

  it("CREATE_ROLE adds a new role", () => {
    const outcome = expectSuccess(base, { opVersion: v, type: "CREATE_ROLE", role: { id: "auditor", name: "Auditor" } });
    expect(outcome.spec.roles.some((r) => r.id === "auditor")).toBe(true);
  });

  it("UPDATE_ROLE renames a role", () => {
    const outcome = expectSuccess(base, { opVersion: v, type: "UPDATE_ROLE", roleId: "manager", patch: { name: "Site Manager" } });
    expect(outcome.spec.roles.find((r) => r.id === "manager")?.name).toBe("Site Manager");
  });

  it("SET_PERMISSION adds a new permission grant", () => {
    const outcome = expectSuccess(base, {
      opVersion: v,
      type: "SET_PERMISSION",
      permission: { id: "perm_new", roleId: "employee_role", entityId: "project", verb: "update", effect: "allow" },
    });
    expect(outcome.spec.permissions.some((p) => p.id === "perm_new")).toBe(true);
  });

  it("SET_PERMISSION upserts an existing (roleId, entityId, verb) tuple", () => {
    const outcome = expectSuccess(base, {
      opVersion: v,
      type: "SET_PERMISSION",
      permission: { id: "perm_replacement", roleId: "admin", entityId: "project", verb: "create", effect: "deny" },
    });
    const matching = outcome.spec.permissions.filter((p) => p.roleId === "admin" && p.entityId === "project" && p.verb === "create");
    expect(matching).toHaveLength(1);
    expect(matching[0].effect).toBe("deny");
  });

  it("REMOVE_PERMISSION deletes a permission grant", () => {
    const outcome = expectSuccess(base, { opVersion: v, type: "REMOVE_PERMISSION", permissionId: "perm_employee_task_update" });
    expect(outcome.spec.permissions.some((p) => p.id === "perm_employee_task_update")).toBe(false);
  });

  it("CREATE_WORKFLOW adds a new workflow", () => {
    const outcome = expectSuccess(base, {
      opVersion: v,
      type: "CREATE_WORKFLOW",
      workflow: { id: "wf_new", name: "New workflow", trigger: { kind: "manual" }, steps: [] },
    });
    expect(outcome.spec.workflows.some((w) => w.id === "wf_new")).toBe(true);
  });

  it("UPDATE_WORKFLOW changes a workflow's editable properties", () => {
    const outcome = expectSuccess(base, {
      opVersion: v,
      type: "UPDATE_WORKFLOW",
      workflowId: "workflow_notify_assignment",
      patch: { name: "Notify assignee on completion" },
    });
    expect(outcome.spec.workflows.find((w) => w.id === "workflow_notify_assignment")?.name).toBe(
      "Notify assignee on completion",
    );
  });

  it("ARCHIVE_WORKFLOW marks a workflow archived", () => {
    const outcome = expectSuccess(base, { opVersion: v, type: "ARCHIVE_WORKFLOW", workflowId: "workflow_notify_assignment" });
    expect(outcome.spec.workflows.find((w) => w.id === "workflow_notify_assignment")?.archived).toBe(true);
  });

  it("UPDATE_BRANDING merges branding changes", () => {
    const outcome = expectSuccess(base, { opVersion: v, type: "UPDATE_BRANDING", patch: { primaryColor: "#ff0000" } });
    expect(outcome.spec.branding.primaryColor).toBe("#ff0000");
    expect(outcome.spec.branding.companyName).toBe(base.branding.companyName); // untouched
  });

  it("UPDATE_APP_METADATA merges app metadata changes", () => {
    const outcome = expectSuccess(base, { opVersion: v, type: "UPDATE_APP_METADATA", patch: { name: "New App Name" } });
    expect(outcome.spec.app.name).toBe("New App Name");
    expect(outcome.spec.app.slug).toBe(base.app.slug); // untouched
  });
});

describe("applySpecOperation — purity and validation", () => {
  it("never mutates the input specification", () => {
    const before = checksumOf(base);
    applySpecOperation(base, { opVersion: v, type: "ARCHIVE_ENTITY", entityId: "project" }, { confirmDestructive: true });
    expect(checksumOf(base)).toBe(before);
  });

  it("rejects an operation payload that doesn't validate against the operation schema", () => {
    const outcome = applySpecOperation(base, { opVersion: v, type: "CREATE_ENTITY", entity: { id: "Bad Id!" } });
    expect(outcome.ok).toBe(false);
  });

  it("rejects a precondition failure (duplicate entity id) without touching the spec", () => {
    const outcome = applySpecOperation(base, {
      opVersion: v,
      type: "CREATE_ENTITY",
      entity: { id: "project", machineName: "project2", name: "Duplicate" },
    });
    expect(outcome.ok).toBe(false);
  });

  it("rejects an operation whose result would fail semantic validation, leaving the spec structurally untouched", () => {
    const outcome = applySpecOperation(base, {
      opVersion: v,
      type: "ADD_FIELD",
      entityId: "task",
      field: {
        id: "linked_customer",
        machineName: "linked_customer",
        name: "Customer",
        type: "relation",
        required: false,
        unique: false,
        archived: false,
        relationId: "does_not_exist",
      },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.errors.some((e) => e.code === "orphaned_reference")).toBe(true);
    }
  });

  it("rejects an unknown operation type", () => {
    const outcome = applySpecOperation(base, { opVersion: v, type: "DROP_DATABASE", sql: "DROP TABLE users" });
    expect(outcome.ok).toBe(false);
  });

  it("rejects an operation with an incompatible opVersion", () => {
    const outcome = applySpecOperation(base, {
      opVersion: "99.0.0",
      type: "ARCHIVE_ENTITY",
      entityId: "project",
    });
    expect(outcome.ok).toBe(false);
  });
});

describe("applySpecOperation — destructive confirmation", () => {
  it("rejects a destructive change (archiving an entity) without confirmDestructive", () => {
    const outcome = applySpecOperation(base, { opVersion: v, type: "ARCHIVE_ENTITY", entityId: "project" });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.destructive?.classification).toBe("entity_removed");
    }
  });

  it("applies the same destructive change once confirmDestructive is set", () => {
    const outcome = applySpecOperation(
      base,
      { opVersion: v, type: "ARCHIVE_ENTITY", entityId: "project" },
      { confirmDestructive: true },
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.destructive?.classification).toBe("entity_removed");
    }
  });

  it("rejects tightening a field to required without confirmation", () => {
    const outcome = applySpecOperation(base, {
      opVersion: v,
      type: "UPDATE_FIELD",
      entityId: "project",
      fieldId: "description",
      patch: { required: true },
    });
    expect(outcome.ok).toBe(false);
  });

  it("does not classify a non-destructive rename as destructive", () => {
    const outcome = applySpecOperation(base, {
      opVersion: v,
      type: "UPDATE_ENTITY",
      entityId: "project",
      patch: { name: "Renamed" },
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.destructive).toBeNull();
    }
  });
});

describe("applySpecOperation — determinism and replay", () => {
  it("produces the same checksum for the same base + operation applied twice independently", () => {
    const operation = { opVersion: v, type: "CREATE_ENTITY", entity: { id: "supplier", machineName: "supplier", name: "Supplier" } };
    const first = applySpecOperation(base, operation, { confirmDestructive: true });
    const second = applySpecOperation(base, operation, { confirmDestructive: true });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.checksum).toBe(second.checksum);
    }
  });

  it("replaying the same ordered operation sequence produces the same final spec and checksum", () => {
    const ops = [
      { opVersion: v, type: "CREATE_ENTITY", entity: { id: "supplier", machineName: "supplier", name: "Supplier" } },
      { opVersion: v, type: "ADD_FIELD", entityId: "supplier", field: { id: "name", machineName: "name", name: "Name", type: "text", required: true, unique: false, archived: false } },
      { opVersion: v, type: "UPDATE_ENTITY", entityId: "supplier", patch: { description: "Materials supplier" } },
    ];

    function replay(): { spec: ApplicationSpecificationType; checksum: string } {
      let current = base;
      let checksum = "";
      for (const operation of ops) {
        const outcome = applySpecOperation(current, operation, { confirmDestructive: true });
        if (!outcome.ok) throw new Error("replay failed");
        current = outcome.spec;
        checksum = outcome.checksum;
      }
      return { spec: current, checksum };
    }

    const runA = replay();
    const runB = replay();
    expect(runA.checksum).toBe(runB.checksum);
    expect(checksumOf(runA.spec)).toBe(checksumOf(runB.spec));
  });
});
