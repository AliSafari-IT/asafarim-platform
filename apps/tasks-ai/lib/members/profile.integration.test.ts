/**
 * #759: the membership profile snapshot is written on every join path and
 * refreshed on signed-in requests, against a real (throwaway) database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { hasTestDatabase, requireTestDatabaseUrl } from "../db/test-database";
import { PrismaClient } from "../db/generated";

type Viewer = { id: string; roles: string[]; name?: string | null; image?: string | null };
const viewerMock = vi.hoisted(() => ({ current: null as null | Viewer }));
vi.mock("../session", () => ({ getViewer: async () => viewerMock.current }));

describe.skipIf(!hasTestDatabase())("membership profile snapshot (integration)", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    const url = requireTestDatabaseUrl();
    execSync("pnpm exec prisma migrate deploy --schema prisma/schema.prisma", {
      cwd: process.cwd(),
      env: { ...process.env, TASKSAI_DATABASE_URL: url },
      stdio: "inherit",
    });
    // createWorkspace, acceptInvitation and resolveContext use getTasksAiDb().
    process.env.TASKSAI_DATABASE_URL = url;
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  const unique = (tag: string) => `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  it("creating a workspace writes the owner's snapshot from the session", async () => {
    const { createWorkspace } = await import("../services/workspaces");
    viewerMock.current = { id: unique("owner"), roles: [], name: "Ada Lovelace", image: "https://cdn.example/ada.png" };
    const created = (await createWorkspace({ name: "Snap", slug: unique("snap") }, "cid-ws")) as { id: string };
    const owner = await db.membership.findFirst({ where: { workspaceId: created.id, platformUserId: viewerMock.current.id } });
    expect(owner).toMatchObject({
      role: "owner",
      displayName: "Ada Lovelace",
      avatarUrl: "https://cdn.example/ada.png",
      profileSyncedAt: expect.any(Date),
    });
  });

  it("accepting an invitation writes the invitee's snapshot", async () => {
    const { createInvitation, acceptInvitation } = await import("../services/invitations");
    const ws = await db.workspace.create({ data: { name: "Inv", slug: unique("inv") } });
    const ownerId = unique("o");
    const owner = await db.membership.create({ data: { workspaceId: ws.id, platformUserId: ownerId, role: "owner" } });
    const ctx = {
      db,
      workspaceId: ws.id,
      workspaceSlug: ws.slug,
      actor: { membershipId: owner.id, platformUserId: ownerId, role: "owner" as const },
      correlationId: "cid-inv",
    };
    const invite = (await createInvitation(ctx, { email: "grace@example.test", role: "member" })) as { token: string };

    viewerMock.current = { id: unique("invitee"), roles: [], name: "Grace Hopper", image: "javascript:alert(1)" };
    await acceptInvitation(invite.token, "cid-accept");
    const member = await db.membership.findFirst({ where: { workspaceId: ws.id, platformUserId: viewerMock.current.id } });
    // The name is copied; a non-http(s) avatar is refused.
    expect(member).toMatchObject({ displayName: "Grace Hopper", avatarUrl: null, profileSyncedAt: expect.any(Date) });
  });

  it("a signed-in request refreshes a changed snapshot and leaves an unchanged one alone", async () => {
    const { resolveContext } = await import("../context");
    const ws = await db.workspace.create({ data: { name: "Ref", slug: unique("ref") } });
    const userId = unique("u");
    const m = await db.membership.create({
      data: { workspaceId: ws.id, platformUserId: userId, role: "member", displayName: "Old Name" },
    });

    viewerMock.current = { id: userId, roles: [], name: "New Name", image: null };
    await resolveContext(ws.slug, "cid-1");
    const refreshed = await db.membership.findUnique({ where: { id: m.id } });
    expect(refreshed).toMatchObject({ displayName: "New Name", profileSyncedAt: expect.any(Date) });

    await resolveContext(ws.slug, "cid-2"); // same values: no write
    const after = await db.membership.findUnique({ where: { id: m.id } });
    expect(after?.profileSyncedAt?.getTime()).toBe(refreshed?.profileSyncedAt?.getTime());
  });

  it("an archived membership is refused and its (cleared) snapshot is not re-created", async () => {
    const { resolveContext } = await import("../context");
    const ws = await db.workspace.create({ data: { name: "Arc", slug: unique("arc") } });
    const userId = unique("gone");
    const m = await db.membership.create({
      data: { workspaceId: ws.id, platformUserId: userId, role: "member", archivedAt: new Date() },
    });
    viewerMock.current = { id: userId, roles: [], name: "Should Not Appear", image: null };
    await expect(resolveContext(ws.slug, "cid-arc")).rejects.toMatchObject({ code: "not_found" });
    expect((await db.membership.findUnique({ where: { id: m.id } }))?.displayName).toBeNull();
  });
});
