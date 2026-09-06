import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { hasTestDatabase, requireTestDatabaseUrl } from "../db/test-database";
import { PrismaClient } from "../db/generated";
import type { RequestContext } from "../context";

vi.mock("../session", () => ({ getViewer: async () => ({ id: "noop" }) }));

describe.skipIf(!hasTestDatabase())("portability (integration)", () => {
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

  async function ws(tag: string) {
    const w = await db.workspace.create({
      data: { name: tag, slug: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
    });
    const owner = await db.membership.create({
      data: { workspaceId: w.id, platformUserId: `owner-${tag}`, role: "owner" },
    });
    const ctx: RequestContext = {
      db,
      workspaceId: w.id,
      workspaceSlug: w.slug,
      actor: { membershipId: owner.id, platformUserId: `owner-${tag}`, role: "owner" },
      correlationId: `cid-${tag}`,
    };
    return { w, owner, ctx };
  }

  it("global search is workspace-scoped: a query in A never returns B's task", async () => {
    const { createProject } = await import("./projects");
    const { createTask } = await import("./tasks");
    const { globalSearch } = await import("../search");

    const a = await ws("srchA");
    const b = await ws("srchB");
    const pa = await createProject(a.ctx, { name: "PA", key: "PA1" });
    await createTask(a.ctx, { projectId: pa.id, title: "kryptonite widget spec" });
    const pb = await createProject(b.ctx, { name: "PB", key: "PB1" });
    await createTask(b.ctx, { projectId: pb.id, title: "kryptonite widget spec" });

    const inA = await globalSearch(a.ctx, "kryptonite widget");
    const inB = await globalSearch(b.ctx, "kryptonite widget");
    expect(inA.filter((h) => h.type === "task")).toHaveLength(1);
    expect(inB.filter((h) => h.type === "task")).toHaveLength(1);
    expect(inA[0].id).not.toBe(inB.find((h) => h.type === "task")!.id);
  });

  it("CSV import: dry-run reports errors, apply is idempotent", async () => {
    const { createProject } = await import("./projects");
    const { createImport, applyImport } = await import("../import/service");

    const a = await ws("impA");
    const proj = await createProject(a.ctx, { name: "P", key: "IMP" });
    const content = "Id,Title,Due\n1,First task,2026-09-10\n2,,2026-09-11\n3,Third,not-a-date\n";

    const dry = await createImport(a.ctx, {
      kind: "csv",
      filename: "tasks.csv",
      projectId: proj.id,
      mapping: { title: "Title", dueDate: "Due", externalId: "Id" },
      content,
    });
    expect(dry.totalRows).toBe(3);
    expect(dry.failedRows).toBe(2);
    expect(dry.okRows).toBe(1);

    const applied1 = await applyImport(a.ctx, dry.id);
    expect(applied1.appliedRows).toBe(1);
    const applied2 = await applyImport(a.ctx, dry.id);
    expect(applied2.appliedRows).toBe(1); // no duplicate on re-run

    const tasks = await db.task.count({ where: { workspaceId: a.w.id, source: "import" } });
    expect(tasks).toBe(1);
  });

  it("inbound email: valid signature creates a task; a replayed message-id is rejected", async () => {
    const { createProject } = await import("./projects");
    const { provisionInboundAddress, receiveInboundEmail } = await import("../capture/inbound");

    const a = await ws("inbnd");
    await createProject(a.ctx, { name: "P", key: "INB" });
    const addr = await provisionInboundAddress(a.ctx);

    const email = {
      localPart: addr.localPart,
      messageId: "<msg-1@example.com>",
      subject: "Ship the newsletter",
      text: "before Friday",
      from: "ceo@example.com",
    };
    const first = await receiveInboundEmail(email, "cid-in-1");
    expect(first.taskId).toBeTruthy();

    await expect(receiveInboundEmail(email, "cid-in-2")).rejects.toMatchObject({
      code: "conflict_unique",
    });
  });

  it("inbound email: an unknown or tampered address is rejected, never captured", async () => {
    const { createProject } = await import("./projects");
    const { provisionInboundAddress, receiveInboundEmail } = await import("../capture/inbound");
    const a = await ws("inbnd2");
    await createProject(a.ctx, { name: "P", key: "IN2" });
    const addr = await provisionInboundAddress(a.ctx);
    // Keep the base, corrupt the HMAC segment -> row still resolves by the
    // full localPart lookup? No: the full string changes, so it must be a
    // safe 4xx (not_found or forbidden), and no task is created.
    const tampered = `${addr.localPart.split("-")[0]}-deadbeef99`;

    await expect(
      receiveInboundEmail(
        { localPart: tampered, messageId: "x", subject: "s", text: "t", from: "f" },
        "cid",
      ),
    ).rejects.toMatchObject({ status: expect.any(Number) });
    const captured = await db.task.count({ where: { workspaceId: a.w.id } });
    expect(captured).toBe(0);
  });

  it("workspace export round-trips core entities as JSON", async () => {
    const { createProject } = await import("./projects");
    const { createTask } = await import("./tasks");
    const { exportWorkspace } = await import("../export/workspace");

    const a = await ws("expw");
    const p = await createProject(a.ctx, { name: "Exp", key: "EXP" });
    await createTask(a.ctx, { projectId: p.id, title: "=danger()" });

    const out = await exportWorkspace(a.ctx, "json");
    const parsed = JSON.parse(out.body);
    expect(parsed.projects).toHaveLength(1);
    expect(parsed.tasks[0].title).toBe("=danger()");

    const csv = await exportWorkspace(a.ctx, "csv");
    expect(csv.body).toContain("'=danger()"); // formula-injection neutralized
  });
});
