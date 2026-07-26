import { describe, expect, it } from "vitest";
import { emptySpecification, type ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import { permissionsAuthorizationGate } from "./permissionsAuthorization";
import type { GateContext } from "../types";

/**
 * Directly reproduces the M09 team_member permission-gap bug this gate was
 * built to catch: a `team_member` entity reachable only via a relation
 * field (`assignee_ref` on `task`) with ZERO explicit read-permission
 * decisions for any role. No database access is needed — this gate is pure
 * specification analysis — so a minimal fake GateContext suffices.
 */
function buildSpec(options: { grantTeamMemberRead: boolean }): ApplicationSpecificationType {
  const spec = emptySpecification({ name: "Test App", slug: "test-app" });
  spec.roles = [{ id: "admin", name: "Admin", archived: false }];
  spec.entities = [
    { id: "task", machineName: "task", name: "Task", fields: [{ id: "assignee_ref", machineName: "assignee_ref", name: "Assignee", type: "relation", relationId: "task_assignee", required: false, unique: false, archived: false }], indexes: [], archived: false },
    { id: "team_member", machineName: "team_member", name: "Team Member", fields: [{ id: "name", machineName: "name", name: "Name", type: "text", required: true, unique: false, archived: false }], indexes: [], archived: false },
  ];
  spec.relations = [{ id: "task_assignee", name: "Task Assignee", fromEntityId: "task", toEntityId: "team_member", cardinality: "oneToMany", onDelete: "setNull", archived: false }];
  spec.pages = [{ id: "tasks", name: "Tasks", path: "tasks", components: [{ id: "tasks_table", kind: "dataTable", entityId: "task", config: {}, order: 0 }], archived: false }];
  spec.permissions = [
    { id: "perm_admin_task_read", roleId: "admin", entityId: "task", verb: "read", effect: "allow" },
    ...(options.grantTeamMemberRead ? [{ id: "perm_admin_team_member_read", roleId: "admin", entityId: "team_member", verb: "read" as const, effect: "allow" as const }] : []),
  ];
  return spec;
}

function fakeContext(spec: ApplicationSpecificationType): GateContext {
  return {
    db: null as never,
    appId: "test-app",
    runId: "test-run",
    specPayload: spec,
    specVersionId: "v1",
    specVersionNumber: 1,
    specChecksum: "checksum",
    previewBuild: null,
    registryVersion: "test",
    ownerPrincipalId: "owner-1",
    signal: new AbortController().signal,
  };
}

describe("permissionsAuthorizationGate", () => {
  it("FAILS when a role reaches an entity via a relation field but has no explicit read-permission decision (the exact M09 team_member bug)", async () => {
    const result = await permissionsAuthorizationGate.execute(fakeContext(buildSpec({ grantTeamMemberRead: false })));
    expect(result.status).toBe("failed");
    expect(result.failureCode).toBe("missing_read_permission");
    expect(result.structuredFailures?.some((f) => f.message.includes("team_member"))).toBe(true);
  });

  it("PASSES once the missing read permission is granted", async () => {
    const result = await permissionsAuthorizationGate.execute(fakeContext(buildSpec({ grantTeamMemberRead: true })));
    expect(result.status).toBe("passed");
  });
});
