import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { hasTestDatabase, requireTestDatabaseUrl } from "../db/test-database";
import { PrismaClient } from "../db/generated";
import type { RequestContext } from "../context";
import { resetEnvCache } from "../env";

vi.mock("../session", () => ({ getViewer: vi.fn() }));

/**
 * The issue #366 exit tests, against a real database: captured work reaches
 * the Inbox, triage takes it out, a triaged item assigned to me shows up in
 * My Work, every capture channel keeps its provenance, and a guest can
 * neither capture nor triage.
 *
 * Skipped unless TASKSAI_TEST_DATABASE_URL points at a throwaway database.
 */
describe.skipIf(!hasTestDatabase())("capture and inbox (integration)", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    const url = requireTestDatabaseUrl();
    execSync("pnpm exec prisma migrate deploy --schema prisma/schema.prisma", {
      cwd: process.cwd(),
      env: { ...process.env, TASKSAI_DATABASE_URL: url },
      stdio: "inherit",
    });
    // receiveInboundEmail (lib/capture/inbound.ts) is a machine entrypoint with
    // no RequestContext, so it reads getTasksAiDb()'s global singleton — which
    // reads TASKSAI_DATABASE_URL, not TASKSAI_TEST_DATABASE_URL. Point it at
    // the same throwaway database as `db`, matching the existing convention in
    // automations.integration.test.ts.
    process.env.TASKSAI_DATABASE_URL = url;
    // See the identical comment in automations.integration.test.ts: both
    // getEnv()'s memoized TASKSAI_DATABASE_URL and getTasksAiDb()'s cached
    // client ignore later env changes, so clear both before anything in this
    // file can trigger them.
    resetEnvCache();
    delete (globalThis as { tasksAiPrisma?: unknown }).tasksAiPrisma;
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  async function freshWorkspace(label: string) {
    const ws = await db.workspace.create({
      data: { name: label, slug: `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
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

  it("a task captured without a project appears in the Inbox and nowhere near projects[0]", async () => {
    const { ctx } = await freshWorkspace("cap-a");
    const { createProject } = await import("../services/projects");
    const { createTask } = await import("../services/tasks");
    const { listInbox } = await import("./service");

    const first = await createProject(ctx, { name: "First", key: "FST" });
    await createProject(ctx, { name: "Second", key: "SND" });

    const task = await createTask(ctx, { title: "Ring the supplier", source: "quick_capture" });

    expect(task.projectId).not.toBe(first.id);
    expect(task.triagedAt).toBeNull();

    const inbox = await listInbox(ctx);
    expect(inbox.items.map((i) => i.id)).toContain(task.id);
    expect(inbox.items.find((i) => i.id === task.id)?.projectIsInbox).toBe(true);
  });

  it("triage removes the item from the Inbox and puts it into My Work", async () => {
    const { ctx, owner } = await freshWorkspace("cap-b");
    const { createProject } = await import("../services/projects");
    const { createTask } = await import("../services/tasks");
    const { listInbox, triageTask } = await import("./service");
    const { listTasks } = await import("../repositories/tasks");

    const project = await createProject(ctx, { name: "Delivery", key: "DEL" });
    const task = await createTask(ctx, { title: "Chase the invoice", source: "quick_capture" });

    // Before triage: in the Inbox, absent from My Work.
    expect((await listInbox(ctx)).items.map((i) => i.id)).toContain(task.id);
    const myWorkBefore = await listTasks(ctx, {
      limit: 50,
      assigneeId: owner.id,
      inbox: false,
    });
    expect(myWorkBefore.items.map((t) => t.id)).not.toContain(task.id);

    await triageTask(ctx, task.id, { projectId: project.id, assigneeId: owner.id });

    expect((await listInbox(ctx)).items.map((i) => i.id)).not.toContain(task.id);
    const myWorkAfter = await listTasks(ctx, { limit: 50, assigneeId: owner.id, inbox: false });
    expect(myWorkAfter.items.map((t) => t.id)).toContain(task.id);
    const stored = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.projectId).toBe(project.id);
    expect(stored.triagedAt).not.toBeNull();
  });

  it("completing an Inbox item removes it from the Inbox too", async () => {
    const { ctx } = await freshWorkspace("cap-c");
    const { createTask, completeTask } = await import("../services/tasks");
    const { listInbox } = await import("./service");

    const task = await createTask(ctx, { title: "Two-minute job", source: "quick_capture" });
    await completeTask(ctx, task.id);

    expect((await listInbox(ctx)).items.map((i) => i.id)).not.toContain(task.id);
  });

  it("email capture keeps its provenance and waits in the Inbox", async () => {
    const { ctx } = await freshWorkspace("cap-d");
    const { provisionInboundAddress, receiveInboundEmail } = await import("./inbound");
    const { listInbox } = await import("./service");

    const address = await provisionInboundAddress(ctx);
    const { taskId } = await receiveInboundEmail(
      {
        localPart: address.localPart,
        messageId: `msg-${Date.now()}`,
        subject: "Please quote the roof job",
        text: "Customer asked for a quote.",
        from: "customer@example.com",
      },
      ctx.correlationId,
    );

    const stored = await db.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(stored.source).toBe("email");
    expect(stored.triagedAt).toBeNull();
    expect((await listInbox(ctx)).items.map((i) => i.id)).toContain(taskId);
  });

  it("imports keep source=import, and land in the Inbox only when asked to", async () => {
    const { ctx } = await freshWorkspace("cap-e");
    const { createProject } = await import("../services/projects");
    const { createImport, applyImport } = await import("../import/service");

    const project = await createProject(ctx, { name: "Backlog", key: "BKL" });
    const csv = "title\nMigrate the old list\n";

    const plain = await createImport(ctx, {
      kind: "csv",
      filename: "a.csv",
      projectId: project.id,
      mapping: { title: "title" },
      content: csv,
    });
    await applyImport(ctx, plain.id);

    const forReview = await createImport(ctx, {
      kind: "csv",
      filename: "b.csv",
      projectId: project.id,
      mapping: { title: "title" },
      content: "title\nReview this one\n",
      captureToInbox: true,
    });
    await applyImport(ctx, forReview.id);

    const rows = await db.task.findMany({ where: { workspaceId: ctx.workspaceId } });
    const plainRow = rows.find((t) => t.title === "Migrate the old list");
    const reviewRow = rows.find((t) => t.title === "Review this one");
    expect(plainRow?.source).toBe("import");
    expect(plainRow?.triagedAt).not.toBeNull();
    expect(reviewRow?.source).toBe("import");
    expect(reviewRow?.triagedAt).toBeNull();
  });

  it("a guest may not capture or triage, and sees only their own projects' Inbox", async () => {
    const { ws, ctx } = await freshWorkspace("cap-f");
    const { createTask } = await import("../services/tasks");
    const { listInbox, triageTask } = await import("./service");

    const captured = await createTask(ctx, { title: "Owner captured", source: "quick_capture" });

    const guest = await db.membership.create({
      data: { workspaceId: ws.id, platformUserId: `guest-${ws.id}`, role: "guest" },
    });
    const guestCtx: RequestContext = {
      ...ctx,
      actor: { membershipId: guest.id, platformUserId: guest.platformUserId, role: "guest" },
    };

    await expect(
      createTask(guestCtx, { title: "guest capture", source: "quick_capture" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(triageTask(guestCtx, captured.id, { triaged: true })).rejects.toMatchObject({
      code: "forbidden",
    });
    // The Inbox container is not a project the guest belongs to.
    expect((await listInbox(guestCtx)).items.map((i) => i.id)).not.toContain(captured.id);
  });

  it("applying an AI proposal without owner or date lands the work in the Inbox", async () => {
    const { ctx } = await freshWorkspace("cap-g");
    const { createProject } = await import("../services/projects");
    const { applyProposal } = await import("../ai/proposals");
    const { listInbox } = await import("./service");

    const project = await createProject(ctx, { name: "Plan", key: "PLN" });
    const job = await db.aiJob.create({
      data: {
        workspaceId: ctx.workspaceId,
        membershipId: ctx.actor.membershipId,
        kind: "plan_tasks",
        state: "succeeded",
        provider: "fixture",
        model: "fixture",
        promptVersion: "test",
        cacheKey: `cache-${ctx.workspaceId}`,
      },
    });
    const proposal = await db.proposal.create({
      data: {
        workspaceId: ctx.workspaceId,
        membershipId: ctx.actor.membershipId,
        aiJobId: job.id,
        kind: "plan_tasks",
        state: "draft",
        operations: [
          {
            op: "create_task",
            ref: "t1",
            fields: { title: "Draft the statement of work" },
            confidence: 0.8,
            citations: [],
          },
        ],
      },
    });

    await applyProposal(ctx, proposal.id, { projectId: project.id });

    const inbox = await listInbox(ctx);
    expect(inbox.items.map((i) => i.title)).toContain("Draft the statement of work");
    expect(inbox.items.find((i) => i.title === "Draft the statement of work")?.source).toBe(
      "proposal",
    );
  });
});
