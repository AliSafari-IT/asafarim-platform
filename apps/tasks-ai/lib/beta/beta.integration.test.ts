import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { hasTestDatabase, requireTestDatabaseUrl } from "../db/test-database";
import { PrismaClient } from "../db/generated";
import type { RequestContext } from "../context";

vi.mock("../session", () => ({ getViewer: async () => ({ id: "noop" }) }));

describe.skipIf(!hasTestDatabase())("beta (integration)", () => {
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

  it("consent gate: requireBetaConsent blocks an enrolled-but-unconsented member, then allows after consent", async () => {
    const { enrollBeta, giveConsent, requireBetaConsent } = await import("./service");
    const a = await ws("consent");
    await enrollBeta(a.ctx, { cohort: "concierge", teamType: "agency" });
    await expect(requireBetaConsent(a.ctx)).rejects.toMatchObject({ code: "forbidden" });
    await giveConsent(a.ctx);
    await expect(requireBetaConsent(a.ctx)).resolves.toBeUndefined();
  });

  it("feedback: respondBy is derived from severity; resolving stamps respondedAt", async () => {
    const { createFeedback, triageFeedback } = await import("./service");
    const a = await ws("fb");
    const blocker = await createFeedback(a.ctx, { source: "in_app", severity: "blocker", title: "cannot save", detail: "500 on PATCH" });
    const idea = await createFeedback(a.ctx, { source: "interview", severity: "idea", title: "dark mode toggle in nav", detail: "..." });
    // respondBy is derived from Date.now(), createdAt from the DB default —
    // within a few ms of each other.
    expect(blocker.respondBy.getTime() - blocker.createdAt.getTime()).toBeGreaterThan(4 * 3600_000 - 5000);
    expect(blocker.respondBy.getTime() - blocker.createdAt.getTime()).toBeLessThan(4 * 3600_000 + 5000);
    expect(idea.respondBy.getTime() - idea.createdAt.getTime()).toBeGreaterThan(720 * 3600_000 - 5000);

    const resolved = await triageFeedback(a.ctx, blocker.id, { state: "resolved", linkedChange: "pr:#999" });
    expect(resolved.respondedAt).toBeTruthy();
    expect(resolved.linkedChange).toBe("pr:#999");
  });

  it("changing severity in triage recomputes respondBy from createdAt", async () => {
    const { createFeedback, triageFeedback } = await import("./service");
    const a = await ws("fbsev");
    const item = await createFeedback(a.ctx, { source: "support", severity: "minor", title: "typo", detail: "x" });
    const bumped = await triageFeedback(a.ctx, item.id, { severity: "blocker" });
    expect(bumped.respondBy.getTime()).toBe(item.createdAt.getTime() + 4 * 3600_000);
  });

  it("beta metrics aggregate the KPI numbers for the workspace", async () => {
    const { betaMetrics } = await import("./service");
    const { createProject } = await import("../services/projects");
    const { createTask, completeTask } = await import("../services/tasks");
    const a = await ws("bm");
    const proj = await createProject(a.ctx, { name: "P", key: "BMT" });
    const t1 = await createTask(a.ctx, { projectId: proj.id, title: "a" });
    await createTask(a.ctx, { projectId: proj.id, title: "b" });
    await completeTask(a.ctx, t1.id);

    const m = await betaMetrics(a.ctx);
    expect(m.tasksCreated).toBeGreaterThanOrEqual(2);
    expect(m.tasksCompleted).toBeGreaterThanOrEqual(1);
    expect(m.completionRatio).not.toBeNull();
    expect(typeof m.activeMembers).toBe("number");
  });

  it("owner records a beta decision on the enrollment", async () => {
    const { enrollBeta, recordBetaDecision } = await import("./service");
    const a = await ws("dec");
    await enrollBeta(a.ctx, { cohort: "self_serve" });
    const row = await recordBetaDecision(a.ctx, { decision: "continue" });
    expect(row.decision).toBe("continue");
    expect(row.decidedAt).toBeTruthy();
  });
});
