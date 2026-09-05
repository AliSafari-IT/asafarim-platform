import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { hasTestDatabase, requireTestDatabaseUrl } from "../db/test-database";
import { PrismaClient } from "../db/generated";
import type { RequestContext } from "../context";

const viewerMock = vi.hoisted(() => ({ current: null as null | { id: string } }));
vi.mock("../session", () => ({ getViewer: async () => viewerMock.current }));

describe.skipIf(!hasTestDatabase())("collaboration (integration)", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    const url = requireTestDatabaseUrl();
    execSync("pnpm exec prisma migrate deploy --schema prisma/schema.prisma", {
      cwd: process.cwd(),
      env: { ...process.env, TASKSAI_DATABASE_URL: url },
      stdio: "inherit",
    });
    // Services that don't take a ctx (acceptInvitation, the outbox drainer)
    // resolve their client from getTasksAiDb() -> TASKSAI_DATABASE_URL, so
    // point it at the throwaway db before any of them run.
    process.env.TASKSAI_DATABASE_URL = url;
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  async function workspace(tag: string, ownerUser: string) {
    const ws = await db.workspace.create({ data: { name: tag, slug: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` } });
    const owner = await db.membership.create({
      data: { workspaceId: ws.id, platformUserId: ownerUser, role: "owner" },
    });
    const ctx: RequestContext = {
      db,
      workspaceId: ws.id,
      workspaceSlug: ws.slug,
      actor: { membershipId: owner.id, platformUserId: ownerUser, role: "owner" },
      correlationId: `cid-${tag}-${Date.now()}`,
    };
    return { ws, owner, ctx };
  }

  it("invitation lifecycle: create -> accept -> replay is a 404, no second membership", async () => {
    const { createInvitation, acceptInvitation } = await import("./invitations");
    const a = await workspace("inv", "owner-inv");

    const invite = await createInvitation(a.ctx, { email: "New Person <new@ex.com>".replace(/.*<|>/g, ""), role: "member" });
    viewerMock.current = { id: "invitee-1" };
    const accepted = await acceptInvitation(invite.token, "cid-accept");
    expect(accepted.workspaceId).toBe(a.ws.id);

    await expect(acceptInvitation(invite.token, "cid-accept-2")).rejects.toMatchObject({ code: "not_found" });
    const count = await db.membership.count({ where: { workspaceId: a.ws.id, platformUserId: "invitee-1" } });
    expect(count).toBe(1);
  });

  it("a mention token carrying another workspace's membership id does not notify across tenants", async () => {
    const { addComment } = await import("./comments");
    const { createProject } = await import("./projects");
    const { createTask } = await import("./tasks");

    const a = await workspace("mA", "owner-a");
    const b = await workspace("mB", "owner-b");

    const proj = await createProject(a.ctx, { name: "p", key: "PPP" });
    const task = await createTask(a.ctx, { projectId: proj.id, title: "t" });

    // owner-b's membership id, mentioned inside workspace A.
    await addComment(a.ctx, task.id, { body: `hello @[Owner B](${b.owner.id})` });

    const leaked = await db.notification.count({ where: { recipientId: b.owner.id } });
    expect(leaked).toBe(0);
  });

  it("comment mentions notify the mentioned member once (dedupe) and make them a watcher", async () => {
    const { addComment } = await import("./comments");
    const { createProject } = await import("./projects");
    const { createTask } = await import("./tasks");

    const a = await workspace("mC", "owner-c");
    const other = await db.membership.create({
      data: { workspaceId: a.ws.id, platformUserId: "member-c", role: "member" },
    });
    const proj = await createProject(a.ctx, { name: "p", key: "QQQ" });
    const task = await createTask(a.ctx, { projectId: proj.id, title: "t" });

    await addComment(a.ctx, task.id, { body: `@[C](${other.id}) @[C again](${other.id}) look` });

    const notes = await db.notification.findMany({ where: { recipientId: other.id, kind: "mention" } });
    expect(notes).toHaveLength(1);
    const watching = await db.watcher.count({ where: { taskId: task.id, membershipId: other.id } });
    expect(watching).toBe(1);
  });

  it("the outbox drainer marks notification.dispatch rows done and is idempotent", async () => {
    const { addComment } = await import("./comments");
    const { createProject } = await import("./projects");
    const { createTask } = await import("./tasks");
    const { drainOutboxOnce } = await import("../../worker/outbox");

    const a = await workspace("ob", "owner-ob");
    const m = await db.membership.create({
      data: { workspaceId: a.ws.id, platformUserId: "m-ob", role: "member" },
    });
    const proj = await createProject(a.ctx, { name: "p", key: "OBX" });
    const task = await createTask(a.ctx, { projectId: proj.id, title: "t" });
    await addComment(a.ctx, task.id, { body: `@[M](${m.id})` });

    const first = await drainOutboxOnce();
    expect(first.processed).toBeGreaterThan(0);
    const second = await drainOutboxOnce();
    expect(second.processed).toBe(0);
    const pending = await db.outboxEvent.count({ where: { workspaceId: a.ws.id, status: "pending" } });
    expect(pending).toBe(0);
  });
});
