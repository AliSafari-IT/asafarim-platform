import { describe, expect, it } from "vitest";
import { authorize, can, isAtLeast, type Actor } from "./authz";
import { ApiError } from "./errors";

const actor = (role: Actor["role"]): Actor => ({
  membershipId: "m1",
  platformUserId: "u1",
  role,
});

describe("authz", () => {
  it("owner can do everything members and admins can", () => {
    for (const action of ["task.create", "project.archive", "workspace.archive"] as const) {
      expect(can(actor("owner"), action)).toBe(true);
    }
  });

  it("a guest cannot create tasks or projects", () => {
    expect(can(actor("guest"), "task.create")).toBe(false);
    expect(can(actor("guest"), "project.create")).toBe(false);
  });

  it("a member cannot archive a workspace or manage custom fields", () => {
    expect(can(actor("member"), "workspace.archive")).toBe(false);
    expect(can(actor("member"), "customfield.manage")).toBe(false);
  });

  it("an admin can invite and manage teams but not archive the workspace", () => {
    expect(can(actor("admin"), "membership.invite")).toBe(true);
    expect(can(actor("admin"), "team.manage")).toBe(true);
    expect(can(actor("admin"), "workspace.archive")).toBe(false);
  });

  it("authorize throws a forbidden ApiError with context", () => {
    try {
      authorize(actor("guest"), "task.create");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe("forbidden");
      expect((e as ApiError).status).toBe(403);
    }
  });

  it("isAtLeast ranks roles", () => {
    expect(isAtLeast("admin", "member")).toBe(true);
    expect(isAtLeast("member", "admin")).toBe(false);
  });
});
