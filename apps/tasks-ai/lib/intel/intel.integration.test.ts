import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { hasTestDatabase, requireTestDatabaseUrl } from "../db/test-database";
import { PrismaClient } from "../db/generated";
import type { RequestContext } from "../context";

vi.mock("../session", () => ({ getViewer: async () => ({ id: "noop" }) }));

describe.skipIf(!hasTestDatabase())("intelligence (integration)", () => {
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

  it("focus list ranks the viewer's overdue task above a far-future one, with a factor breakdown", async () => {
    const { createProject } = await import("../services/projects");
    const { createTask, updateTask } = await import("../services/tasks");
    const { focusList } = await import("./service");
    const a = await ws("focus");
    const proj = await createProject(a.ctx, { name: "P", key: "FOC" });

    const overdue = await createTask(a.ctx, { projectId: proj.id, title: "overdue thing", assigneeId: a.owner.id, dueDate: "2026-08-01T00:00:00Z" });
    const later = await createTask(a.ctx, { projectId: proj.id, title: "later thing", assigneeId: a.owner.id, dueDate: "2026-12-01T00:00:00Z" });
    void updateTask;

    const res = await focusList(a.ctx);
    const ids = res.items.map((i) => i.task.id);
    expect(ids.indexOf(overdue.id)).toBeLessThan(ids.indexOf(later.id));
    expect(res.items[0].factors.some((f) => f.factor === "urgency")).toBe(true);
    expect(res.ruleVersion).toMatch(/^focus-rank@/);
  });

  it("disabling a signal via preference removes it from the workspace signals", async () => {
    const { createProject } = await import("../services/projects");
    const { createTask } = await import("../services/tasks");
    const { workspaceSignals, setSignalPreference } = await import("./service");
    const a = await ws("sigpref");
    const proj = await createProject(a.ctx, { name: "P", key: "SGP" });
    await createTask(a.ctx, { projectId: proj.id, title: "risky", dueDate: "2026-08-01T00:00:00Z" });

    const before = await workspaceSignals(a.ctx);
    expect(before.signals.some((s) => s.type === "due_date_risk")).toBe(true);

    await setSignalPreference(a.ctx, { signalType: "due_date_risk", enabled: false });
    const after = await workspaceSignals(a.ctx);
    expect(after.signals.some((s) => s.type === "due_date_risk")).toBe(false);
  });

  it("the daily brief passes the anti-surveillance guard end to end", async () => {
    const { createProject } = await import("../services/projects");
    const { createTask } = await import("../services/tasks");
    const { dailyBrief } = await import("./service");
    const a = await ws("brief");
    const proj = await createProject(a.ctx, { name: "P", key: "BRF" });
    for (let i = 0; i < 6; i++)
      await createTask(a.ctx, { projectId: proj.id, title: `t${i}`, assigneeId: a.owner.id });

    const brief = await dailyBrief(a.ctx); // throws SurveillanceGuardError if it scored a person
    expect(brief.topFocus.length).toBeGreaterThan(0);
    expect(JSON.stringify(brief)).not.toMatch(/productivity|performance score|emotion/i);
  });
});
