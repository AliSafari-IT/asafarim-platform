import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { hasTestDatabase, requireTestDatabaseUrl } from "../db/test-database";
import { PrismaClient } from "../db/generated";
import type { RequestContext } from "../context";

vi.mock("../session", () => ({ getViewer: async () => ({ id: "noop" }) }));

describe.skipIf(!hasTestDatabase())("billing (integration)", () => {
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
  afterEach(() => {
    delete process.env.TASKSAI_COMMERCIAL_LICENSE_SIGNED;
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

  it("checkout is refused by the license gate until the license is signed", async () => {
    const { startCheckout } = await import("./service");
    const a = await ws("gate");
    await expect(startCheckout(a.ctx, { tier: "pro", seats: 5 })).rejects.toThrow(/billing is not open/i);

    process.env.TASKSAI_COMMERCIAL_LICENSE_SIGNED = "true";
    const res = await startCheckout(a.ctx, { tier: "pro", seats: 5 });
    expect(res).toMatchObject({ stub: true }); // no Stripe key -> stub session
  });

  it("feature + allowance gates are no-ops while billing is closed (AI still runs on any workspace)", async () => {
    const { assertFeature, assertAllowance } = await import("./service");
    const a = await ws("noop");
    await expect(assertFeature(a.ctx, "ai")).resolves.toBeUndefined();
    await expect(assertAllowance(a.ctx, "ai_proposals")).resolves.toBeUndefined();
  });

  it("with billing open: free plan has no AI feature; pro allowance blocks overage", async () => {
    process.env.TASKSAI_COMMERCIAL_LICENSE_SIGNED = "true";
    const { assertFeature, assertAllowance, recordUsage } = await import("./service");
    const a = await ws("gated");

    await expect(assertFeature(a.ctx, "ai")).rejects.toMatchObject({ code: "forbidden" });

    await db.subscription.create({ data: { workspaceId: a.w.id, tier: "pro", status: "active", seats: 3 } });
    await assertFeature(a.ctx, "ai"); // ok now
    // burn the 200 pro allowance
    const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    await db.usageMeter.create({
      data: { workspaceId: a.w.id, meter: "ai_proposals", periodStart: start, periodEnd: new Date(start.getTime() + 30 * 86400000), included: 200, used: 200 },
    });
    await expect(assertAllowance(a.ctx, "ai_proposals")).rejects.toMatchObject({ code: "rate_limited" });
    void recordUsage;
  });

  it("usage transparency reports tier, meters, and the cost driver", async () => {
    process.env.TASKSAI_COMMERCIAL_LICENSE_SIGNED = "true";
    const { usageTransparency } = await import("./service");
    const a = await ws("trans");
    await db.subscription.create({ data: { workspaceId: a.w.id, tier: "business", status: "active", seats: 4 } });
    const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    await db.usageMeter.create({ data: { workspaceId: a.w.id, meter: "ai_proposals", periodStart: start, periodEnd: new Date(start.getTime() + 1), included: 1000, used: 950 } });

    const t = await usageTransparency(a.ctx);
    expect(t.tier).toBe("business");
    expect(t.estimatedMonthlyCents).toBe(1400 * 4);
    expect(t.costDriver).toBe("ai_proposals");
    expect(t.meters.find((m) => m.meter === "ai_proposals")?.remaining).toBe(50);
  });

  it("cancel moves the sub to canceled with a grace window", async () => {
    process.env.TASKSAI_COMMERCIAL_LICENSE_SIGNED = "true";
    const { cancelSubscription } = await import("./service");
    const a = await ws("cancel");
    await db.subscription.create({ data: { workspaceId: a.w.id, tier: "pro", status: "active", seats: 3, currentPeriodEnd: new Date(Date.now() + 5 * 86400000) } });
    const res = await cancelSubscription(a.ctx);
    expect(res.status).toBe("canceled");
    expect(res.graceEndsAt).toBeTruthy();
  });
});
