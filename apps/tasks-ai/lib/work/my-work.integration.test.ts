import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { hasTestDatabase, requireTestDatabaseUrl } from "../db/test-database";
import { PrismaClient } from "../db/generated";
import type { RequestContext } from "../context";
import { resetEnvCache } from "../env";
import { groupMyWork } from "./my-work";

vi.mock("../session", () => ({ getViewer: vi.fn() }));

/**
 * The issue #367 exit tests, against a real database: My Work lists the
 * caller's own triaged open work with real project context, the counts
 * behind the empty states are honest, completion and date changes move rows
 * to the right section, quick planning edits respect roles and versions, and
 * a guest never sees work in projects they do not belong to.
 *
 * Skipped unless TASKSAI_TEST_DATABASE_URL points at a throwaway database.
 */
describe.skipIf(!hasTestDatabase())("my work (integration)", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    const url = requireTestDatabaseUrl();
    execSync("pnpm exec prisma migrate deploy --schema prisma/schema.prisma", {
      cwd: process.cwd(),
      env: { ...process.env, TASKSAI_DATABASE_URL: url },
      stdio: "inherit",
    });
    // Same convention as automations/capture: getEnv()'s memoized
    // TASKSAI_DATABASE_URL and getTasksAiDb()'s cached client both ignore
    // later env changes, so clear them before anything can trigger them.
    process.env.TASKSAI_DATABASE_URL = url;
    resetEnvCache();
    delete (globalThis as { tasksAiPrisma?: unknown }).tasksAiPrisma;
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  /**
   * A fresh correlation id per call. In production every mutation is its own
   * request with its own id; the outbox dedupe key is built from it, so a
   * test that fires two mutations through one literal context would collide
   * on a key that can never collide in the real system.
   */
  const request = (ctx: RequestContext): RequestContext => ({
    ...ctx,
    correlationId: `cid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });

  async function freshWorkspace(label: string) {
    const ws = await db.workspace.create({
      data: {
        name: label,
        slug: `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      },
    });
    const owner = await db.membership.create({
      data: { workspaceId: ws.id, platformUserId: `owner-${ws.id}`, role: "owner" },
    });
    const ctx: RequestContext = {
      db,
      workspaceId: ws.id,
      workspaceSlug: ws.slug,
      actor: { membershipId: owner.id, platformUserId: owner.platformUserId, role: "owner" },
      correlationId: `cid-${ws.id}`,
    };
    return { ws, owner, ctx };
  }

  /** A triaged, assigned task — i.e. real My Work, not an Inbox capture. */
  async function planned(
    ctx: RequestContext,
    over: { title: string; projectId: string; assigneeId: string | null; dueDate?: Date | null },
  ) {
    return db.task.create({
      data: {
        workspaceId: ctx.workspaceId,
        projectId: over.projectId,
        title: over.title,
        assigneeId: over.assigneeId,
        dueDate: over.dueDate ?? null,
        triagedAt: new Date(),
      },
    });
  }

  it("lists only the caller's own open, triaged work — never somebody else's, never the Inbox", async () => {
    const { ctx, owner } = await freshWorkspace("mw-a");
    const { createProject } = await import("../services/projects");
    const { createTask } = await import("../services/tasks");
    const { myWorkData } = await import("./service");

    const project = await createProject(ctx, { name: "Delivery", key: "DEL" });
    const other = await db.membership.create({
      data: { workspaceId: ctx.workspaceId, platformUserId: "someone-else", role: "member" },
    });

    const mine = await planned(ctx, { title: "Mine", projectId: project.id, assigneeId: owner.id });
    const theirs = await planned(ctx, {
      title: "Theirs",
      projectId: project.id,
      assigneeId: other.id,
    });
    // An untriaged capture with my name on it is Inbox work, not My Work.
    const captured = await createTask(ctx, {
      title: "Captured",
      assigneeId: owner.id,
      source: "quick_capture",
    });

    const page = await myWorkData(ctx);
    const ids = page.items.map((i) => i.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(theirs.id);
    expect(ids).not.toContain(captured.id);
    expect(page.counts.inboxWaiting).toBeGreaterThan(0);
  });

  it("carries project identity so two identically named tasks are distinguishable", async () => {
    const { ctx, owner } = await freshWorkspace("mw-b");
    const { createProject } = await import("../services/projects");
    const { myWorkData } = await import("./service");

    const app = await createProject(ctx, { name: "Application", key: "APP" });
    const ops = await createProject(ctx, { name: "Operations", key: "OPS" });
    await planned(ctx, { title: "Ship it", projectId: app.id, assigneeId: owner.id, dueDate: day("2026-09-20") });
    await planned(ctx, { title: "Ship it", projectId: ops.id, assigneeId: owner.id, dueDate: day("2026-09-21") });

    const keys = (await myWorkData(ctx)).items
      .filter((i) => i.title === "Ship it")
      .map((i) => `${i.projectKey}:${i.projectName}`)
      .sort();
    expect(keys).toEqual(["APP:Application", "OPS:Operations"]);
  });

  it("reports dependency state from open blockers only", async () => {
    const { ctx, owner } = await freshWorkspace("mw-c");
    const { createProject } = await import("../services/projects");
    const { linkTasks, completeTask } = await import("../services/tasks");
    const { myWorkData } = await import("./service");

    const project = await createProject(ctx, { name: "Delivery", key: "DEL" });
    const blocker = await planned(ctx, {
      title: "Blocker",
      projectId: project.id,
      assigneeId: owner.id,
    });
    const blocked = await planned(ctx, {
      title: "Blocked",
      projectId: project.id,
      assigneeId: owner.id,
    });
    await linkTasks(ctx, blocker.id, { toTaskId: blocked.id, kind: "blocks" });

    const before = (await myWorkData(ctx)).items.find((i) => i.id === blocked.id)!;
    expect(before.blockedBy).toBe(1);
    expect(groupMyWork([before], new Date("2026-09-14T09:00:00Z"))[0].id).toBe("blocked");

    await completeTask(ctx, blocker.id);
    const after = (await myWorkData(ctx)).items.find((i) => i.id === blocked.id)!;
    // A finished blocker is not blocking anything.
    expect(after.blockedBy).toBe(0);
  });

  it("completing from My Work drops the row and updates the counts", async () => {
    const { ctx, owner } = await freshWorkspace("mw-d");
    const { createProject } = await import("../services/projects");
    const { completeTask } = await import("../services/tasks");
    const { myWorkData } = await import("./service");

    const project = await createProject(ctx, { name: "Delivery", key: "DEL" });
    const task = await planned(ctx, {
      title: "Finish me",
      projectId: project.id,
      assigneeId: owner.id,
      dueDate: day("2026-09-10"),
    });

    expect((await myWorkData(ctx)).items.map((i) => i.id)).toContain(task.id);
    await completeTask(ctx, task.id);

    const after = await myWorkData(ctx);
    expect(after.items.map((i) => i.id)).not.toContain(task.id);
    expect(after.counts.assignedOpen).toBe(0);
    expect(after.counts.assignedCompleted).toBe(1);
  });

  it("a planning edit moves the task into the right section and unassigning removes it", async () => {
    const { ctx, owner } = await freshWorkspace("mw-e");
    const { createProject } = await import("../services/projects");
    const { myWorkData, planTask } = await import("./service");

    const project = await createProject(ctx, { name: "Delivery", key: "DEL" });
    const task = await planned(ctx, {
      title: "Reschedule me",
      projectId: project.id,
      assigneeId: owner.id,
      dueDate: day("2026-09-01"),
    });
    const now = new Date("2026-09-14T09:00:00.000Z");
    const listed = (await myWorkData(ctx)).items.find((i) => i.id === task.id)!;
    expect(groupMyWork([listed], now)[0].id).toBe("overdue");

    await planTask(request(ctx), task.id, { dueDate: day("2026-09-14").toISOString() }, listed.version);
    const moved = (await myWorkData(ctx)).items.find((i) => i.id === task.id)!;
    expect(groupMyWork([moved], now)[0].id).toBe("today");
    // Planning does not re-open triage: the row stays organized.
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).triagedAt).not.toBeNull();

    await planTask(request(ctx), task.id, { assigneeId: null }, moved.version);
    expect((await myWorkData(ctx)).items.map((i) => i.id)).not.toContain(task.id);
  });

  it("a stale version loses the planning edit with conflict_version", async () => {
    const { ctx, owner } = await freshWorkspace("mw-f");
    const { createProject } = await import("../services/projects");
    const { planTask } = await import("./service");

    const project = await createProject(ctx, { name: "Delivery", key: "DEL" });
    const task = await planned(ctx, {
      title: "Contested",
      projectId: project.id,
      assigneeId: owner.id,
    });

    const first = await planTask(
      request(ctx),
      task.id,
      { dueDate: day("2026-09-20").toISOString() },
      task.version,
    );
    await expect(
      planTask(request(ctx), task.id, { dueDate: day("2026-09-21").toISOString() }, task.version),
    ).rejects.toMatchObject({ code: "conflict_version" });
    // The winner's value survived.
    const stored = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.dueDate?.toISOString()).toBe(day("2026-09-20").toISOString());
    expect(stored.version).toBe(first.version);
  });

  it("a guest may read their own work but not plan it, and never sees other projects", async () => {
    const { ctx, owner } = await freshWorkspace("mw-g");
    const { createProject } = await import("../services/projects");
    const { myWorkData, planTask } = await import("./service");

    const open = await createProject(ctx, { name: "Open", key: "OPN" });
    const closed = await createProject(ctx, { name: "Closed", key: "CLS" });
    const guest = await db.membership.create({
      data: { workspaceId: ctx.workspaceId, platformUserId: "guest-1", role: "guest" },
    });
    await db.projectMembership.create({
      data: { projectId: open.id, membershipId: guest.id, role: "guest" },
    });

    const visible = await planned(ctx, {
      title: "Guest can see",
      projectId: open.id,
      assigneeId: guest.id,
    });
    const hidden = await planned(ctx, {
      title: "Guest cannot see",
      projectId: closed.id,
      assigneeId: guest.id,
    });
    await planned(ctx, { title: "Owner work", projectId: open.id, assigneeId: owner.id });

    const guestCtx: RequestContext = {
      ...ctx,
      actor: { membershipId: guest.id, platformUserId: "guest-1", role: "guest" },
    };
    const page = await myWorkData(guestCtx);
    const ids = page.items.map((i) => i.id);
    expect(ids).toContain(visible.id);
    expect(ids).not.toContain(hidden.id);
    expect(page.counts.canPlan).toBe(false);

    await expect(
      planTask(guestCtx, visible.id, { dueDate: null }, undefined),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("work cannot be handed to a membership from another workspace", async () => {
    const a = await freshWorkspace("mw-h1");
    const b = await freshWorkspace("mw-h2");
    const { createProject } = await import("../services/projects");
    const { planTask } = await import("./service");

    const project = await createProject(a.ctx, { name: "Delivery", key: "DEL" });
    const task = await planned(a.ctx, {
      title: "Ours",
      projectId: project.id,
      assigneeId: a.owner.id,
    });

    await expect(
      planTask(a.ctx, task.id, { assigneeId: b.owner.id }, task.version),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("the counts explain an empty list: unowned work exists, nothing is mine", async () => {
    const { ctx } = await freshWorkspace("mw-i");
    const { createProject } = await import("../services/projects");
    const { myWorkData } = await import("./service");
    const { emptyStateFor } = await import("./my-work");

    const project = await createProject(ctx, { name: "Delivery", key: "DEL" });
    await planned(ctx, { title: "Nobody owns me", projectId: project.id, assigneeId: null });

    const page = await myWorkData(ctx);
    expect(page.items).toHaveLength(0);
    expect(page.counts.workspaceUnowned).toBe(1);
    expect(emptyStateFor(page.counts)?.kind).toBe("unowned_work_exists");
  });

  it("pages deterministically, most urgent work first", async () => {
    const { ctx, owner } = await freshWorkspace("mw-j");
    const { createProject } = await import("../services/projects");
    const { myWorkData } = await import("./service");

    const project = await createProject(ctx, { name: "Delivery", key: "DEL" });
    await planned(ctx, { title: "undated", projectId: project.id, assigneeId: owner.id });
    await planned(ctx, {
      title: "late",
      projectId: project.id,
      assigneeId: owner.id,
      dueDate: day("2026-09-01"),
    });
    await planned(ctx, {
      title: "later",
      projectId: project.id,
      assigneeId: owner.id,
      dueDate: day("2026-09-30"),
    });

    const first = await myWorkData(ctx, { limit: 2 });
    expect(first.items.map((i) => i.title)).toEqual(["late", "later"]);
    expect(first.nextCursor).not.toBeNull();

    const second = await myWorkData(ctx, { limit: 2, cursor: first.nextCursor! });
    expect(second.items.map((i) => i.title)).toEqual(["undated"]);
    expect(second.nextCursor).toBeNull();
  });
});
