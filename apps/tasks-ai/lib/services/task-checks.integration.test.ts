import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { hasTestDatabase, requireTestDatabaseUrl } from "../db/test-database";
import { PrismaClient } from "../db/generated";
import type { RequestContext } from "../context";

vi.mock("../session", () => ({ getViewer: async () => ({ id: "noop" }) }));

describe.skipIf(!hasTestDatabase())("green-light gate (integration)", () => {
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

  async function ws(tag: string, role: "owner" | "member" = "owner") {
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

  async function makeTask(ctx: RequestContext, tag: string) {
    const { createProject } = await import("../services/projects");
    const { createTask } = await import("../services/tasks");
    const proj = await createProject(ctx, { name: "P", key: tag.slice(0, 4).toUpperCase() });
    return createTask(ctx, { projectId: proj.id, title: "Ship it" });
  }

  it("a task with a pending required check refuses completion with blocked_by_check, naming the check", async () => {
    const { createCheck } = await import("./task-checks");
    const { completeTask } = await import("../services/tasks");
    const a = await ws("gate1");
    const task = await makeTask(a.ctx, "gate1");
    const check = await createCheck(a.ctx, task.id, { source: "testora", key: "Testora: sign-in flow" });

    await expect(completeTask(a.ctx, task.id)).rejects.toMatchObject({
      code: "blocked_by_check",
      details: { checks: [{ id: check.id, state: "pending" }] },
    });
  });

  it("satisfying the check lets completion through", async () => {
    const { createCheck } = await import("./task-checks");
    const { completeTask } = await import("../services/tasks");
    const a = await ws("gate2");
    const task = await makeTask(a.ctx, "gate2");
    const check = await createCheck(a.ctx, task.id, { source: "testora", key: "k" });

    await db.taskCheck.update({ where: { id: check.id }, data: { state: "satisfied" } });

    const done = await completeTask(a.ctx, task.id);
    expect(done.completedAt).toBeTruthy();
  });

  it("an admin override satisfies the check with a recorded, audited reason; a member cannot override", async () => {
    const { createCheck, overrideCheck } = await import("./task-checks");
    const { completeTask } = await import("../services/tasks");
    const admin = await ws("gate3", "owner");
    const task = await makeTask(admin.ctx, "gate3");
    const check = await createCheck(admin.ctx, task.id, { source: "testora", key: "k" });

    const memberRow = await db.membership.create({
      data: { workspaceId: admin.w.id, platformUserId: "member-gate3", role: "member" },
    });
    const memberCtx: RequestContext = { ...admin.ctx, actor: { membershipId: memberRow.id, platformUserId: "member-gate3", role: "member" } };
    await expect(overrideCheck(memberCtx, task.id, check.id, { reason: "not my call" })).rejects.toMatchObject({
      code: "forbidden",
    });

    const overridden = await overrideCheck(admin.ctx, task.id, check.id, { reason: "manually verified in staging" });
    expect(overridden.state).toBe("satisfied");
    expect(overridden.overriddenBy).toBe(admin.actorMember.id);
    expect(overridden.overrideReason).toBe("manually verified in staging");

    const done = await completeTask(admin.ctx, task.id);
    expect(done.completedAt).toBeTruthy();

    const audit = await db.activityEvent.findFirst({
      where: { workspaceId: admin.w.id, name: "check.updated", targetId: task.id },
      orderBy: { occurredAt: "desc" },
    });
    expect((audit?.data as { overridden?: boolean })?.overridden).toBe(true);
  });

  it("a second, unrelated pending check still blocks even after the first is satisfied", async () => {
    const { createCheck } = await import("./task-checks");
    const { completeTask } = await import("../services/tasks");
    const a = await ws("gate4");
    const task = await makeTask(a.ctx, "gate4");
    const c1 = await createCheck(a.ctx, task.id, { source: "testora", key: "k1" });
    await createCheck(a.ctx, task.id, { source: "manual", key: "k2" });
    await db.taskCheck.update({ where: { id: c1.id }, data: { state: "satisfied" } });

    await expect(completeTask(a.ctx, task.id)).rejects.toMatchObject({ code: "blocked_by_check" });
  });
});
