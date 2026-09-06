import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { hasTestDatabase, requireTestDatabaseUrl } from "../db/test-database";
import { PrismaClient } from "../db/generated";
import type { RequestContext } from "../context";

vi.mock("../session", () => ({ getViewer: async () => ({ id: "noop" }) }));

describe.skipIf(!hasTestDatabase())("analytics (integration)", () => {
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
    const w = await db.workspace.create({ data: { name: tag, slug: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` } });
    const owner = await db.membership.create({ data: { workspaceId: w.id, platformUserId: `o-${tag}`, role: "owner" } });
    const ctx: RequestContext = {
      db, workspaceId: w.id, workspaceSlug: w.slug,
      actor: { membershipId: owner.id, platformUserId: `o-${tag}`, role: "owner" },
      correlationId: `cid-${tag}`,
    };
    return { w, owner, ctx };
  }

  it("flow dashboard reconciles with a known set of completed tasks", async () => {
    const { createProject } = await import("../services/projects");
    const { flowDashboard } = await import("./service");
    const a = await ws("flow");
    const proj = await createProject(a.ctx, { name: "P", key: "FLW" });

    // 3 completed inside the 30d window, 1 outside
    for (const [c, done] of [
      ["2026-08-20", "2026-08-25"],
      ["2026-08-20", "2026-08-22"],
      ["2026-08-20", "2026-08-30"],
      ["2026-05-01", "2026-05-03"],
    ] as const) {
      await db.task.create({
        data: { workspaceId: a.w.id, projectId: proj.id, title: "t", createdAt: new Date(c), completedAt: new Date(done) },
      });
    }
    const d = await flowDashboard(a.ctx);
    expect(d.throughput.completed).toBe(3);
    expect(d.cycleTime.count).toBe(3);
    expect(d.cycleTime.p50).toBe(5);
    expect(d.cycleTime.defVersion).toMatch(/^flow@/);
  });

  it("snapshot + history preserve the semantics version", async () => {
    const { snapshotMetrics, metricHistory } = await import("./service");
    const a = await ws("snap");
    await snapshotMetrics(a.ctx);
    await snapshotMetrics(a.ctx);
    const hist = await metricHistory(a.ctx, "throughput_per_day");
    expect(hist.length).toBe(2);
    expect(hist[0].defVersion).toMatch(/^flow@/);
  });

  it("portfolio computes health + a forecast and passes the anti-surveillance guard", async () => {
    const { createProject } = await import("../services/projects");
    const { portfolio } = await import("./service");
    const a = await ws("port");
    const proj = await createProject(a.ctx, { name: "P", key: "PRT" });
    await db.task.create({
      data: { workspaceId: a.w.id, projectId: proj.id, title: "overdue", dueDate: new Date("2026-01-01") },
    });
    const p = await portfolio(a.ctx); // throws if it produced a per-person score
    const item = p.projects.find((x) => x.project.id === proj.id)!;
    expect(item.overdue).toBe(1);
    expect(["watch", "at_risk", "on_track"]).toContain(item.health);
    expect(JSON.stringify(p)).not.toMatch(/productivity|performance score/i);
  });

  it("key results drive goal progress in the portfolio", async () => {
    const { portfolio, upsertKeyResult } = await import("./service");
    const a = await ws("goal");
    const goal = await db.goal.create({ data: { workspaceId: a.w.id, title: "Grow activation" } });
    await upsertKeyResult(a.ctx, { goalId: goal.id, name: "signups", startValue: 0, targetValue: 100, currentValue: 40 });

    const p = await portfolio(a.ctx);
    const g = p.goals.find((x) => x.goal.id === goal.id)!;
    expect(g.keyResults).toBe(1);
    expect(g.progress).toBeCloseTo(0.4, 2);
  });
});
