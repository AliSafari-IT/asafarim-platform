import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { hasTestDatabase, requireTestDatabaseUrl } from "../db/test-database";
import { PrismaClient } from "../db/generated";
import type { RequestContext } from "../context";

vi.mock("../session", () => ({ getViewer: async () => ({ id: "noop" }) }));

/**
 * Dependencies (issue #370): linking, listing both directions, unlinking,
 * and the invariants that make "Blocked by X" trustworthy in the UI.
 */
describe.skipIf(!hasTestDatabase())("task dependencies (integration)", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    const url = requireTestDatabaseUrl();
    execSync("pnpm exec prisma migrate deploy --schema prisma/schema.prisma", {
      cwd: process.cwd(),
      env: { ...process.env, TASKSAI_DATABASE_URL: url },
      stdio: "inherit",
    });
    process.env.TASKSAI_DATABASE_URL = url;
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  async function ws(tag: string, role: "owner" | "member" | "guest" = "owner") {
    const w = await db.workspace.create({
      data: { name: tag, slug: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
    });
    const actorMember = await db.membership.create({
      data: { workspaceId: w.id, platformUserId: `${role}-${tag}`, role },
    });
    const ctx: RequestContext = {
      db,
      workspaceId: w.id,
      workspaceSlug: w.slug,
      actor: { membershipId: actorMember.id, platformUserId: `${role}-${tag}`, role },
      correlationId: `cid-${tag}`,
    };
    return { w, actorMember, ctx };
  }

  // A project key is unique per workspace. Several tests need two tasks in
  // the same workspace, so `tag` alone can't be the key — a second makeTask
  // call with the same tag would collide with the first project it made.
  let projectSeq = 0;
  async function makeTask(ctx: RequestContext, tag: string, title: string) {
    const { createProject } = await import("./projects");
    const { createTask } = await import("./tasks");
    const key = `${tag.slice(0, 2)}${(++projectSeq).toString(36)}`.toUpperCase();
    const proj = await createProject(ctx, { name: "P", key });
    return createTask(ctx, { projectId: proj.id, title });
  }

  it("links two tasks, and listTaskRelations reports both sides correctly", async () => {
    const { linkTasks, listTaskRelations } = await import("./tasks");
    const a = await ws("rel1");
    const from = await makeTask(a.ctx, "rel1", "Design the API");
    const to = await makeTask(a.ctx, "rel1", "Build the client");

    await linkTasks(a.ctx, from.id, { toTaskId: to.id, kind: "blocks" });

    const fromView = await listTaskRelations(a.ctx, from.id);
    expect(fromView.outgoing).toMatchObject([{ kind: "blocks", task: { id: to.id, title: "Build the client" } }]);
    expect(fromView.incoming).toEqual([]);

    const toView = await listTaskRelations(a.ctx, to.id);
    expect(toView.incoming).toMatchObject([{ kind: "blocks", task: { id: from.id, title: "Design the API" } }]);
    expect(toView.outgoing).toEqual([]);
  });

  it("rejects linking a task to itself", async () => {
    const { linkTasks } = await import("./tasks");
    const a = await ws("rel2");
    const task = await makeTask(a.ctx, "rel2", "Solo");

    await expect(linkTasks(a.ctx, task.id, { toTaskId: task.id, kind: "relates" })).rejects.toMatchObject({
      code: "validation_failed",
    });
  });

  it("rejects a duplicate relation of the same kind between the same two tasks", async () => {
    const { linkTasks } = await import("./tasks");
    const a = await ws("rel3");
    const from = await makeTask(a.ctx, "rel3", "A");
    const to = await makeTask(a.ctx, "rel3", "B");

    await linkTasks(a.ctx, from.id, { toTaskId: to.id, kind: "blocks" });
    await expect(linkTasks(a.ctx, from.id, { toTaskId: to.id, kind: "blocks" })).rejects.toMatchObject({
      code: "conflict_unique",
    });
  });

  it("unlinkTasks removes the relation, and only from the side that created it", async () => {
    const { linkTasks, unlinkTasks, listTaskRelations } = await import("./tasks");
    const a = await ws("rel4");
    const from = await makeTask(a.ctx, "rel4", "Blocker");
    const to = await makeTask(a.ctx, "rel4", "Blocked");
    const rel = await linkTasks(a.ctx, from.id, { toTaskId: to.id, kind: "blocks" });

    // The relation belongs to `from`; trying to remove it scoped under
    // `to` (the incoming side) must not find it.
    await expect(unlinkTasks(a.ctx, to.id, rel.id)).rejects.toMatchObject({ code: "not_found" });

    await unlinkTasks(a.ctx, from.id, rel.id);
    const after = await listTaskRelations(a.ctx, from.id);
    expect(after.outgoing).toEqual([]);
  });

  it("a guest cannot link or unlink dependencies", async () => {
    const { linkTasks, unlinkTasks } = await import("./tasks");
    const owner = await ws("rel5", "owner");
    const from = await makeTask(owner.ctx, "rel5", "A");
    const to = await makeTask(owner.ctx, "rel5", "B");
    const rel = await linkTasks(owner.ctx, from.id, { toTaskId: to.id, kind: "relates" });

    const guestMember = await db.membership.create({
      data: { workspaceId: owner.w.id, platformUserId: "guest-rel5", role: "guest" },
    });
    const guestCtx: RequestContext = {
      ...owner.ctx,
      actor: { membershipId: guestMember.id, platformUserId: "guest-rel5", role: "guest" },
    };

    await expect(linkTasks(guestCtx, from.id, { toTaskId: to.id, kind: "blocks" })).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(unlinkTasks(guestCtx, from.id, rel.id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("cross-tenant: a task in another workspace cannot be linked to, and relations do not leak across tenants", async () => {
    const { linkTasks, listTaskRelations } = await import("./tasks");
    const a = await ws("rel6a");
    const b = await ws("rel6b");
    const taskA = await makeTask(a.ctx, "rel6a", "A's task");
    const taskB = await makeTask(b.ctx, "rel6b", "B's task");

    await expect(linkTasks(a.ctx, taskA.id, { toTaskId: taskB.id, kind: "relates" })).rejects.toMatchObject({
      code: "not_found",
    });

    const view = await listTaskRelations(a.ctx, taskA.id);
    expect(view.outgoing).toEqual([]);
    expect(view.incoming).toEqual([]);
  });
});
