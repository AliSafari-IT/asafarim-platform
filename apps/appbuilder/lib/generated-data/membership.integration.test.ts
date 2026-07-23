import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getTemplate } from "@asafarim/appbuilder-runtime";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { createApp } from "../repositories/apps";
import { requestPreviewBuild } from "../repositories/previewService";
import { applyTemplateVersion } from "../repositories/templateApplication";
import { ConflictError, NotFoundError } from "../errors";
import {
  addMember,
  bootstrapOwnerAsAdmin,
  changeMemberRoles,
  FinalAdminProtectionError,
  getOwnMembership,
  listMembers,
  revokeMember,
  UnknownRoleIdError,
} from "./membership";

/**
 * Integration tests for membership.ts — the M09 generated-app membership
 * system, deliberately separate from M03's builder owner/editor/viewer
 * roles (see membership.ts's module docstring).
 */

const db = getTestDb();

const owner = { principalId: "member-owner", roles: [] };
const someone = { principalId: "member-someone", roles: [] };
const another = { principalId: "member-another", roles: [] };

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

/**
 * `createApp` never applies `starterFamily` to the specification itself
 * (it only records the intent on `creationRequests` for M07's AI planner
 * to interpret later — see lib/repositories/apps.ts) — a fresh app always
 * starts from `emptySpecification`. To get a real, pinned task_management
 * spec for these tests we apply the SAME unmodified template the M09 e2e
 * fixtures use (see tests/e2e/global-setup.ts#seedM09App), via
 * `applyTemplateVersion`, before requesting/pinning a preview build.
 */
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

describe("bootstrapOwnerAsAdmin", () => {
  it("creates the owner's first membership row with the given admin role", async () => {
    const app = await makeTaskApp("Bootstrap App", "bootstrap-1");
    const member = await bootstrapOwnerAsAdmin(db, owner, app.id, "admin");
    expect(member.principalId).toBe(owner.principalId);
    expect(member.roleIds).toEqual(["admin"]);
    expect(member.provenance).toBe("owner_bootstrap");
    expect(member.status).toBe("active");
  });

  it("is idempotent: a second bootstrap call returns the existing row unchanged, not a duplicate", async () => {
    const app = await makeTaskApp("Idempotent Bootstrap App", "bootstrap-2");
    const first = await bootstrapOwnerAsAdmin(db, owner, app.id, "admin");
    const second = await bootstrapOwnerAsAdmin(db, owner, app.id, "admin");
    expect(second.id).toBe(first.id);

    const members = await listMembers(db, owner, app.id);
    expect(members).toHaveLength(1);
  });

  it("rejects a role id that does not exist in the pinned specification", async () => {
    const app = await makeTaskApp("Unknown Role App", "bootstrap-3");
    await expect(bootstrapOwnerAsAdmin(db, owner, app.id, "not_a_real_role")).rejects.toBeInstanceOf(UnknownRoleIdError);
  });
});

describe("addMember", () => {
  it("adds a new active member with validated role ids", async () => {
    const app = await makeTaskApp("Add Member App", "add-1");
    const member = await addMember(db, owner, app.id, { principalId: someone.principalId, roleIds: ["manager"] });
    expect(member.status).toBe("active");
    expect(member.roleIds).toEqual(["manager"]);
    expect(member.provenance).toBe("invited");
  });

  it("rejects an unknown role id (UnknownRoleIdError)", async () => {
    const app = await makeTaskApp("Bad Role App", "add-2");
    await expect(addMember(db, owner, app.id, { principalId: someone.principalId, roleIds: ["totally_bogus"] })).rejects.toBeInstanceOf(
      UnknownRoleIdError,
    );
  });

  it("rejects an empty roleIds array", async () => {
    const app = await makeTaskApp("Empty Roles App", "add-3");
    await expect(addMember(db, owner, app.id, { principalId: someone.principalId, roleIds: [] })).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects adding a principal who is already an active member", async () => {
    const app = await makeTaskApp("Dup Member App", "add-4");
    await addMember(db, owner, app.id, { principalId: someone.principalId, roleIds: ["manager"] });
    await expect(addMember(db, owner, app.id, { principalId: someone.principalId, roleIds: ["employee_role"] })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("reactivates a previously revoked member with fresh role ids", async () => {
    const app = await makeTaskApp("Reactivate App", "add-5");
    const admin = await bootstrapOwnerAsAdmin(db, owner, app.id, "admin");
    const added = await addMember(db, owner, app.id, { principalId: someone.principalId, roleIds: ["manager"] });
    // Add a second admin so revoking `someone` (a non-admin) is not blocked
    // by final-admin protection — not needed here since someone isn't an
    // admin, but keep the admin bootstrap row present for realism.
    void admin;

    await revokeMember(db, owner, app.id, added.id);
    const reactivated = await addMember(db, owner, app.id, { principalId: someone.principalId, roleIds: ["employee_role"] });
    expect(reactivated.id).toBe(added.id);
    expect(reactivated.status).toBe("active");
    expect(reactivated.roleIds).toEqual(["employee_role"]);
  });

  it("requires app.manageGeneratedMembers (owner-rank) — an unrelated actor cannot add members", async () => {
    const app = await makeTaskApp("Unrelated Add App", "add-6");
    await expect(addMember(db, another, app.id, { principalId: someone.principalId, roleIds: ["manager"] })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("changeMemberRoles", () => {
  it("changes a non-admin member's roles", async () => {
    const app = await makeTaskApp("Change Roles App", "change-1");
    const member = await addMember(db, owner, app.id, { principalId: someone.principalId, roleIds: ["manager"] });
    const updated = await changeMemberRoles(db, owner, app.id, member.id, ["employee_role"]);
    expect(updated.roleIds).toEqual(["employee_role"]);
  });

  it("rejects an unknown role id", async () => {
    const app = await makeTaskApp("Change Bad Role App", "change-2");
    const member = await addMember(db, owner, app.id, { principalId: someone.principalId, roleIds: ["manager"] });
    await expect(changeMemberRoles(db, owner, app.id, member.id, ["bogus"])).rejects.toBeInstanceOf(UnknownRoleIdError);
  });

  it("throws FinalAdminProtectionError when demoting the sole active administrator", async () => {
    const app = await makeTaskApp("Sole Admin App", "change-3");
    const admin = await bootstrapOwnerAsAdmin(db, owner, app.id, "admin");
    await expect(changeMemberRoles(db, owner, app.id, admin.id, ["manager"])).rejects.toBeInstanceOf(FinalAdminProtectionError);
  });

  it("succeeds demoting one of two active administrators", async () => {
    const app = await makeTaskApp("Two Admins App", "change-4");
    const admin1 = await bootstrapOwnerAsAdmin(db, owner, app.id, "admin");
    const admin2 = await addMember(db, owner, app.id, { principalId: someone.principalId, roleIds: ["admin"] });
    const updated = await changeMemberRoles(db, owner, app.id, admin1.id, ["manager"]);
    expect(updated.roleIds).toEqual(["manager"]);
    // admin2 is still an active admin.
    const members = await listMembers(db, owner, app.id);
    expect(members.find((m) => m.id === admin2.id)?.roleIds).toEqual(["admin"]);
  });

  it("throws NotFoundError for a member id that does not belong to this app", async () => {
    const app = await makeTaskApp("Bad Member Id App", "change-5");
    await expect(changeMemberRoles(db, owner, app.id, "not-a-real-id", ["manager"])).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("revokeMember", () => {
  it("revokes a non-admin member", async () => {
    const app = await makeTaskApp("Revoke App", "revoke-1");
    const member = await addMember(db, owner, app.id, { principalId: someone.principalId, roleIds: ["manager"] });
    const revoked = await revokeMember(db, owner, app.id, member.id);
    expect(revoked.status).toBe("revoked");

    const own = await getOwnMembership(db, someone, app.id);
    expect(own).toBeNull();
  });

  it("is idempotent: revoking an already-revoked member returns it unchanged, not an error", async () => {
    const app = await makeTaskApp("Idempotent Revoke App", "revoke-2");
    const member = await addMember(db, owner, app.id, { principalId: someone.principalId, roleIds: ["manager"] });
    await revokeMember(db, owner, app.id, member.id);
    const second = await revokeMember(db, owner, app.id, member.id);
    expect(second.status).toBe("revoked");
  });

  it("throws FinalAdminProtectionError when revoking the sole active administrator", async () => {
    const app = await makeTaskApp("Sole Admin Revoke App", "revoke-3");
    const admin = await bootstrapOwnerAsAdmin(db, owner, app.id, "admin");
    await expect(revokeMember(db, owner, app.id, admin.id)).rejects.toBeInstanceOf(FinalAdminProtectionError);
  });

  it("succeeds revoking one of two active administrators", async () => {
    const app = await makeTaskApp("Two Admins Revoke App", "revoke-4");
    const admin1 = await bootstrapOwnerAsAdmin(db, owner, app.id, "admin");
    await addMember(db, owner, app.id, { principalId: someone.principalId, roleIds: ["admin"] });
    const revoked = await revokeMember(db, owner, app.id, admin1.id);
    expect(revoked.status).toBe("revoked");
  });
});

describe("getOwnMembership / listMembers", () => {
  it("getOwnMembership returns null for a non-member", async () => {
    const app = await makeTaskApp("Non Member App", "own-1");
    expect(await getOwnMembership(db, someone, app.id)).toBeNull();
  });

  it("getOwnMembership never requires builder capability — any authenticated actor may ask", async () => {
    const app = await makeTaskApp("Ask Membership App", "own-2");
    await addMember(db, owner, app.id, { principalId: someone.principalId, roleIds: ["manager"] });
    const own = await getOwnMembership(db, someone, app.id);
    expect(own?.roleIds).toEqual(["manager"]);
  });

  it("listMembers excludes revoked members and requires manageGeneratedMembers capability", async () => {
    const app = await makeTaskApp("List Members App", "own-3");
    const admin = await bootstrapOwnerAsAdmin(db, owner, app.id, "admin");
    const member = await addMember(db, owner, app.id, { principalId: someone.principalId, roleIds: ["manager"] });
    await revokeMember(db, owner, app.id, member.id);

    const members = await listMembers(db, owner, app.id);
    expect(members.map((m) => m.id)).toEqual([admin.id]);

    await expect(listMembers(db, another, app.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("M03/M09 identity boundary", () => {
  it("an AppBuilder editor collaborator is not automatically a generated-app member", async () => {
    const { addCollaborator } = await import("../repositories/collaborators");
    const app = await makeTaskApp("Boundary App", "boundary-1");
    await addCollaborator(db, owner, app.id, someone.principalId, "editor");
    // `someone` is a real M03 editor now, but has no M09 membership row.
    expect(await getOwnMembership(db, someone, app.id)).toBeNull();
  });
});
