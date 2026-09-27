import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { hasTestDatabase, requireTestDatabaseUrl } from "../db/test-database";
import { PrismaClient } from "../db/generated";
import { resetEnvCache } from "../env";

vi.mock("../session", () => ({ getViewer: async () => ({ id: "noop" }) }));

describe.skipIf(!hasTestDatabase())("proactive brief delivery (integration)", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    const url = requireTestDatabaseUrl();
    execSync("pnpm exec prisma migrate deploy --schema prisma/schema.prisma", {
      cwd: process.cwd(),
      env: { ...process.env, TASKSAI_DATABASE_URL: url },
      stdio: "inherit",
    });
    process.env.TASKSAI_DATABASE_URL = url;
    resetEnvCache();
    delete (globalThis as { tasksAiPrisma?: unknown }).tasksAiPrisma;
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  async function seed(tag: string) {
    const w = await db.workspace.create({
      data: { name: tag, slug: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
    });
    const owner = await db.membership.create({
      data: { workspaceId: w.id, platformUserId: `owner-${tag}`, role: "owner" },
    });
    const ctx = {
      db,
      workspaceId: w.id,
      workspaceSlug: w.slug,
      actor: { membershipId: owner.id, platformUserId: `owner-${tag}`, role: "owner" as const },
      correlationId: `cid-${tag}`,
    };
    const { createProject } = await import("../services/projects");
    const { createTask } = await import("../services/tasks");
    const proj = await createProject(ctx, { name: "P", key: tag.slice(0, 4).toUpperCase() });
    for (let i = 0; i < 3; i++) {
      await createTask(ctx, { projectId: proj.id, title: `${tag} task ${i}`, assigneeId: owner.id });
    }
    return { w, owner, ctx };
  }

  const MORNING = new Date("2026-09-16T08:00:00.000Z"); // 08:00 UTC — inside the morning window

  it("delivers the deterministic brief to an opted-in member in their local morning", async () => {
    const { deliverBriefToMember } = await import("./brief-delivery");
    const { w, owner } = await seed("delivergood");
    await db.notificationPreference.create({
      data: { membershipId: owner.id, briefDelivery: true, timezone: "UTC" },
    });

    const result = await deliverBriefToMember(db, w.id, owner.id, MORNING);
    expect(result).toEqual({ membershipId: owner.id, delivered: true, reason: "delivered" });

    const notif = await db.notification.findFirst({ where: { workspaceId: w.id, recipientId: owner.id, kind: "daily_brief" } });
    expect(notif).not.toBeNull();
    expect((notif!.data as { brief?: { topFocus?: unknown[] } }).brief?.topFocus?.length).toBeGreaterThan(0);
  });

  it("opting out stops delivery immediately", async () => {
    const { deliverBriefToMember } = await import("./brief-delivery");
    const { w, owner } = await seed("optout");
    await db.notificationPreference.create({
      data: { membershipId: owner.id, briefDelivery: false, timezone: "UTC" },
    });

    const result = await deliverBriefToMember(db, w.id, owner.id, MORNING);
    expect(result).toEqual({ membershipId: owner.id, delivered: false, reason: "opted_out" });
    const notif = await db.notification.findFirst({ where: { workspaceId: w.id, recipientId: owner.id, kind: "daily_brief" } });
    expect(notif).toBeNull();
  });

  it("no preference row at all means no delivery (off by default)", async () => {
    const { deliverBriefToMember } = await import("./brief-delivery");
    const { w, owner } = await seed("nopref");
    const result = await deliverBriefToMember(db, w.id, owner.id, MORNING);
    expect(result.delivered).toBe(false);
    expect(result.reason).toBe("opted_out");
  });

  it("skips delivery during the member's quiet hours", async () => {
    const { deliverBriefToMember } = await import("./brief-delivery");
    const { w, owner } = await seed("quiet");
    await db.notificationPreference.create({
      data: { membershipId: owner.id, briefDelivery: true, timezone: "UTC", quietHours: "07:00-09:00" },
    });

    const result = await deliverBriefToMember(db, w.id, owner.id, MORNING); // 08:00 UTC, inside 07-09
    expect(result).toEqual({ membershipId: owner.id, delivered: false, reason: "quiet_hours" });
  });

  it("skips delivery when it is not the member's local morning", async () => {
    const { deliverBriefToMember } = await import("./brief-delivery");
    const { w, owner } = await seed("notmorning");
    await db.notificationPreference.create({
      data: { membershipId: owner.id, briefDelivery: true, timezone: "UTC" },
    });

    const evening = new Date("2026-09-16T20:00:00.000Z");
    const result = await deliverBriefToMember(db, w.id, owner.id, evening);
    expect(result).toEqual({ membershipId: owner.id, delivered: false, reason: "not_morning" });
  });

  it("dedupes when the member already pulled today's brief via GET /brief", async () => {
    const { deliverBriefToMember } = await import("./brief-delivery");
    const { dailyBrief } = await import("./service");
    const { w, owner, ctx } = await seed("alreadyviewed");
    await db.notificationPreference.create({
      data: { membershipId: owner.id, briefDelivery: true, timezone: "UTC" },
    });

    // Simulate the member already having pulled it through the endpoint —
    // dailyBrief() records the brief.viewed audit event used for dedup.
    await dailyBrief(ctx);

    // dailyBrief() stamps brief.viewed with the real clock, so the delivery
    // has to happen on that same (UTC) day — the fixed MORNING would only
    // match on the date it names. 08:00 UTC today keeps it inside the
    // morning window whenever the suite runs.
    const morningToday = new Date();
    morningToday.setUTCHours(8, 0, 0, 0);
    const result = await deliverBriefToMember(db, w.id, owner.id, morningToday);
    expect(result).toEqual({ membershipId: owner.id, delivered: false, reason: "already_viewed_today" });
    const notif = await db.notification.findFirst({ where: { workspaceId: w.id, recipientId: owner.id, kind: "daily_brief" } });
    expect(notif).toBeNull();
  });

  it("running the sweep twice in the same morning only delivers once (worker-side dedup)", async () => {
    const { runBriefDeliverySweep } = await import("./brief-delivery");
    const { w, owner } = await seed("sweeptwice");
    await db.notificationPreference.create({
      data: { membershipId: owner.id, briefDelivery: true, timezone: "UTC" },
    });

    const first = await runBriefDeliverySweep(db, MORNING);
    const second = await runBriefDeliverySweep(db, new Date(MORNING.getTime() + 60_000));
    expect(first.find((r) => r.membershipId === owner.id)?.delivered).toBe(true);
    expect(second.find((r) => r.membershipId === owner.id)?.delivered).toBe(false);

    const count = await db.notification.count({ where: { workspaceId: w.id, recipientId: owner.id, kind: "daily_brief" } });
    expect(count).toBe(1);
  });

  it("AI-disabled workspaces still get the deterministic brief (no narrative)", async () => {
    const { deliverBriefToMember } = await import("./brief-delivery");
    const { w, owner } = await seed("aioff");
    await db.notificationPreference.create({
      data: { membershipId: owner.id, briefDelivery: true, timezone: "UTC" },
    });
    await db.aiSettings.create({ data: { workspaceId: w.id, enabled: false } });

    const result = await deliverBriefToMember(db, w.id, owner.id, MORNING);
    expect(result.delivered).toBe(true);

    const notif = await db.notification.findFirst({ where: { workspaceId: w.id, recipientId: owner.id, kind: "daily_brief" } });
    expect((notif!.data as { narrative: unknown }).narrative).toBeNull();
  });

  it("a surveillance-shaped AI narrative is dropped before send, but the deterministic brief still goes out", async () => {
    vi.doMock("../ai/job", () => ({
      runAiJob: async () => ({
        proposal: { summary: "Ana is a top performer this sprint", state: "draft" },
      }),
    }));
    vi.resetModules();
    const { deliverBriefToMember } = await import("./brief-delivery");
    const { w, owner } = await seed("guardnarrative");
    await db.notificationPreference.create({
      data: { membershipId: owner.id, briefDelivery: true, timezone: "UTC" },
    });

    const result = await deliverBriefToMember(db, w.id, owner.id, MORNING);
    expect(result.delivered).toBe(true);

    const notif = await db.notification.findFirst({ where: { workspaceId: w.id, recipientId: owner.id, kind: "daily_brief" } });
    expect((notif!.data as { narrative: unknown }).narrative).toBeNull();
    expect(JSON.stringify(notif!.data)).not.toMatch(/top performer/i);

    vi.doUnmock("../ai/job");
    vi.resetModules();
  });
});
