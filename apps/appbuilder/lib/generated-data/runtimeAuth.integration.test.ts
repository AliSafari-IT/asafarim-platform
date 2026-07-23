import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { emptySpecification, type ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import { getTemplate } from "@asafarim/appbuilder-runtime";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { createApp } from "../repositories/apps";
import { requestPreviewBuild } from "../repositories/previewService";
import { applyTemplateVersion } from "../repositories/templateApplication";
import { generatedRowAccessRules } from "../db/schema";
import { generateId } from "../db/ids";
import { NotFoundError } from "../errors";
import { addMember, bootstrapOwnerAsAdmin } from "./membership";
import {
  assertRuntimePermission,
  canViewPage,
  hasPermission,
  listPermittedPageIds,
  loadPinnedSpec,
  NotAMemberError,
  recordSatisfiesScope,
  resolveRowAccessScope,
  resolveRuntimeContext,
  RuntimePermissionDeniedError,
  type RuntimeContext,
} from "./runtimeAuth";

const db = getTestDb();

const owner = { principalId: "runtime-owner", roles: [] };
const employee = { principalId: "runtime-employee", roles: [] };
const stranger = { principalId: "runtime-stranger", roles: [] };

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

async function makeTaskApp(name: string, suffix: string) {
  const app = await createApp(
    db,
    owner,
    {
      name,
      slug: `${suffix}-${Math.random().toString(36).slice(2, 8)}`,
      description: "d",
      prompt: "p",
      starterFamily: "task_management",
      visibility: "private",
    },
    `create-${suffix}`,
  );
  const template = getTemplate("task_management");
  if (!template) throw new Error("task_management template is not registered");
  await applyTemplateVersion(db, owner, app.id, { template, baseVersionNumber: 1, idempotencyKey: `${suffix}-template` });
  await requestPreviewBuild(db, owner, app.id);
  return app;
}

describe("loadPinnedSpec", () => {
  it("throws NotFoundError when the app has no pinned preview yet", async () => {
    const app = await createApp(
      db,
      owner,
      { name: "No Pin App", slug: `no-pin-${Math.random().toString(36).slice(2, 8)}`, description: "d", prompt: "p", starterFamily: "blank", visibility: "private" },
      "no-pin-1",
    );
    await expect(loadPinnedSpec(db, app.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("resolves the pinned specification and its version number after a successful preview build", async () => {
    const app = await makeTaskApp("Loadable App", "load-1");
    const { spec, versionNumber } = await loadPinnedSpec(db, app.id);
    expect(spec.entities.map((e) => e.id).sort()).toEqual(["project", "task", "team_member"]);
    // version 1 is the app's initial empty specification (createApp);
    // applyTemplateVersion appends version 2 with the task_management
    // template, which is what ends up pinned by requestPreviewBuild.
    expect(versionNumber).toBe(2);
  });
});

describe("resolveRuntimeContext", () => {
  it("throws NotAMemberError for an authenticated actor with no membership row", async () => {
    const app = await makeTaskApp("Non Member App", "ctx-1");
    await expect(resolveRuntimeContext(db, stranger, app.id)).rejects.toBeInstanceOf(NotAMemberError);
  });

  it("resolves the real member's roleIds and marks the context not simulated", async () => {
    const app = await makeTaskApp("Real Member App", "ctx-2");
    await addMember(db, owner, app.id, { principalId: employee.principalId, roleIds: ["employee_role"] });

    const ctx = await resolveRuntimeContext(db, employee, app.id);
    expect(ctx.roleIds).toEqual(["employee_role"]);
    expect(ctx.simulated).toBe(false);
    expect(ctx.membership).not.toBeNull();
  });

  it("simulateRoleId resolves a context with no real membership row and simulated: true", async () => {
    const app = await makeTaskApp("Simulate App", "ctx-3");
    // `stranger` has no membership row at all, yet simulation still resolves.
    const ctx = await resolveRuntimeContext(db, stranger, app.id, { simulateRoleId: "manager" });
    expect(ctx.roleIds).toEqual(["manager"]);
    expect(ctx.simulated).toBe(true);
    expect(ctx.membership).toBeNull();
  });
});

describe("hasPermission / assertRuntimePermission", () => {
  function specWithPermissions(): ApplicationSpecificationType {
    const spec = emptySpecification({ name: "Perm App", slug: "perm-app" });
    return {
      ...spec,
      entities: [{ id: "widget", machineName: "widget", name: "Widget", fields: [], indexes: [], archived: false }],
      roles: [
        { id: "allow_role", name: "Allow role", archived: false },
        { id: "deny_role", name: "Deny role", archived: false },
        { id: "no_perm_role", name: "No perm role", archived: false },
      ],
      permissions: [
        { id: "p1", roleId: "allow_role", entityId: "widget", verb: "read", effect: "allow" },
        { id: "p2", roleId: "deny_role", entityId: "widget", verb: "read", effect: "deny" },
      ],
    };
  }

  it("grants access when a matching allow permission exists", () => {
    const spec = specWithPermissions();
    expect(hasPermission(spec, ["allow_role"], "widget", "read")).toBe(true);
  });

  it("defaults to deny when no permission matches at all (default-closed)", () => {
    const spec = specWithPermissions();
    expect(hasPermission(spec, ["no_perm_role"], "widget", "read")).toBe(false);
    expect(hasPermission(spec, ["allow_role"], "widget", "delete")).toBe(false);
  });

  it("deny wins over allow when a member holds multiple roles with conflicting grants", () => {
    const spec = specWithPermissions();
    expect(hasPermission(spec, ["allow_role", "deny_role"], "widget", "read")).toBe(false);
  });

  it("assertRuntimePermission throws RuntimePermissionDeniedError when denied", () => {
    const spec = specWithPermissions();
    const ctx: RuntimeContext = {
      appId: "app-x",
      actor: stranger,
      membership: null,
      roleIds: ["no_perm_role"],
      spec,
      specVersionNumber: 1,
      simulated: true,
    };
    expect(() => assertRuntimePermission(ctx, "widget", "read")).toThrow(RuntimePermissionDeniedError);
  });

  it("assertRuntimePermission does not throw when allowed", () => {
    const spec = specWithPermissions();
    const ctx: RuntimeContext = {
      appId: "app-x",
      actor: stranger,
      membership: null,
      roleIds: ["allow_role"],
      spec,
      specVersionNumber: 1,
      simulated: true,
    };
    expect(() => assertRuntimePermission(ctx, "widget", "read")).not.toThrow();
  });
});

describe("canViewPage / listPermittedPageIds", () => {
  it("a page with no requiredRoleIds is visible to everyone", async () => {
    const app = await makeTaskApp("Page Visibility App", "page-1");
    const ctx = await resolveRuntimeContext(db, owner, app.id, { simulateRoleId: "employee_role" });
    expect(canViewPage(ctx, "dashboard")).toBe(true);
  });

  it("a page restricted to admin/manager is invisible to an employee", async () => {
    const app = await makeTaskApp("Page Restricted App", "page-2");
    const employeeCtx = await resolveRuntimeContext(db, owner, app.id, { simulateRoleId: "employee_role" });
    expect(canViewPage(employeeCtx, "team")).toBe(false);
    expect(canViewPage(employeeCtx, "settings")).toBe(false);

    const adminCtx = await resolveRuntimeContext(db, owner, app.id, { simulateRoleId: "admin" });
    expect(canViewPage(adminCtx, "team")).toBe(true);
    expect(canViewPage(adminCtx, "settings")).toBe(true);
  });

  it("returns false for an unknown/archived page id", async () => {
    const app = await makeTaskApp("Unknown Page App", "page-3");
    const ctx = await resolveRuntimeContext(db, owner, app.id, { simulateRoleId: "admin" });
    expect(canViewPage(ctx, "does-not-exist")).toBe(false);
  });

  it("listPermittedPageIds excludes role-restricted pages for a lower role", async () => {
    const app = await makeTaskApp("List Pages App", "page-4");
    const employeeCtx = await resolveRuntimeContext(db, owner, app.id, { simulateRoleId: "employee_role" });
    const ids = listPermittedPageIds(employeeCtx);
    expect(ids).not.toContain("team");
    expect(ids).not.toContain("settings");
    expect(ids).toContain("dashboard");
  });
});

describe("resolveRowAccessScope / recordSatisfiesScope", () => {
  it("returns 'all' when no row-access rule is configured for the role/entity/verb", async () => {
    const app = await makeTaskApp("No Rule App", "scope-1");
    const ctx = await resolveRuntimeContext(db, owner, app.id, { simulateRoleId: "employee_role" });
    const scope = await resolveRowAccessScope(db, ctx, "task", "read");
    expect(scope).toEqual({ kind: "all" });
  });

  it("honors a configured 'own' row-access rule", async () => {
    const app = await makeTaskApp("Own Rule App", "scope-2");
    await db.insert(generatedRowAccessRules).values({
      id: generateId(),
      appId: app.id,
      entityId: "task",
      roleId: "employee_role",
      verb: "read",
      ruleKind: "own",
      ruleConfig: {},
    });
    const ctx = await resolveRuntimeContext(db, owner, app.id, { simulateRoleId: "employee_role" });
    const scope = await resolveRowAccessScope(db, ctx, "task", "read");
    expect(scope).toEqual({ kind: "own" });

    expect(recordSatisfiesScope(scope, employee, { createdByPrincipalId: employee.principalId, data: {} })).toBe(true);
    expect(recordSatisfiesScope(scope, employee, { createdByPrincipalId: "someone-else", data: {} })).toBe(false);
  });

  it("honors a configured 'assigned' row-access rule keyed on a field id", async () => {
    const app = await makeTaskApp("Assigned Rule App", "scope-3");
    await db.insert(generatedRowAccessRules).values({
      id: generateId(),
      appId: app.id,
      entityId: "task",
      roleId: "employee_role",
      verb: "read",
      ruleKind: "assigned",
      ruleConfig: { assigneeFieldId: "assignee_ref" },
    });
    const ctx = await resolveRuntimeContext(db, owner, app.id, { simulateRoleId: "employee_role" });
    const scope = await resolveRowAccessScope(db, ctx, "task", "read");
    expect(scope).toEqual({ kind: "assigned", assigneeFieldId: "assignee_ref" });

    expect(recordSatisfiesScope(scope, employee, { createdByPrincipalId: "x", data: { assignee_ref: employee.principalId } })).toBe(true);
    expect(recordSatisfiesScope(scope, employee, { createdByPrincipalId: "x", data: { assignee_ref: "someone-else" } })).toBe(false);
  });

  it("picks the LEAST restrictive rule when a member holds two roles with different scopes ('all' beats 'own')", async () => {
    const app = await makeTaskApp("Least Restrictive App", "scope-4");
    await db.insert(generatedRowAccessRules).values([
      { id: generateId(), appId: app.id, entityId: "task", roleId: "employee_role", verb: "read", ruleKind: "own", ruleConfig: {} },
      { id: generateId(), appId: app.id, entityId: "task", roleId: "manager", verb: "read", ruleKind: "all", ruleConfig: {} },
    ]);
    const ctx: RuntimeContext = {
      appId: app.id,
      actor: employee,
      membership: null,
      roleIds: ["employee_role", "manager"],
      spec: (await loadPinnedSpec(db, app.id)).spec,
      specVersionNumber: 1,
      simulated: true,
    };
    const scope = await resolveRowAccessScope(db, ctx, "task", "read");
    expect(scope).toEqual({ kind: "all" });
  });

  it("recordSatisfiesScope treats 'relatedToParent' as unsatisfied when checked directly (query.ts resolves it with joins instead)", () => {
    expect(
      recordSatisfiesScope({ kind: "relatedToParent", parentRelationId: "task_project" }, employee, { createdByPrincipalId: employee.principalId, data: {} }),
    ).toBe(false);
  });
});
