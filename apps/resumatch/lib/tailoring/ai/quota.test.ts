import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const ledgerAggregate = vi.fn();
const queryRaw = vi.fn();
vi.mock("../../db/client", () => ({
  getJobmatchDb: () => ({
    workspace: { findUnique: (...a: unknown[]) => findUnique(...a) },
    aiUsageLedger: { aggregate: (...a: unknown[]) => ledgerAggregate(...a) },
    $queryRaw: (...a: unknown[]) => queryRaw(...a),
  }),
}));

const getPlatformSetting = vi.fn();
vi.mock("../../platform-settings", () => ({
  getPlatformSetting: (...a: unknown[]) => getPlatformSetting(...a),
}));
const env: { aiMonthlyBudgetUsd: number; aiGlobalMonthlyBudgetUsd: number | null } = {
  aiMonthlyBudgetUsd: 5,
  aiGlobalMonthlyBudgetUsd: null,
};
vi.mock("../../env", () => ({ getEnv: () => env }));

const logWarn = vi.fn();
vi.mock("../../observability/logger", () => ({
  log: { warn: (...a: unknown[]) => logWarn(...a) },
}));

import {
  QuotaExceededError,
  assertCanRunProviderCall,
  budgetStatus,
  degradedReasonOf,
  globalMonthlyBudgetUsd,
  maybeAlertGlobalThreshold,
  nextMonthStart,
  resetGlobalAlertForTests,
  resolveMonthlyBudget,
  usageSummary,
} from "./quota";
import { errorCodeOf } from "../../ai/callOutcome";

/** Prisma returns Decimal columns as objects; Number() is how quota reads them. */
const decimal = (value: string) => ({
  toString: () => value,
  valueOf: () => Number(value),
});

beforeEach(() => {
  env.aiGlobalMonthlyBudgetUsd = null;
  logWarn.mockReset();
  resetGlobalAlertForTests();
  findUnique.mockReset();
  ledgerAggregate.mockReset().mockResolvedValue({ _sum: { costUsd: 1 } });
  queryRaw.mockReset().mockResolvedValue([{ micros: 500_000n }]); // $0.50
  // The settings client returns the caller's fallback when nothing is set.
  getPlatformSetting
    .mockReset()
    .mockImplementation(async (_key: string, fallback: number) => fallback);
});

describe("resolveMonthlyBudget", () => {
  it("uses the workspace override and never reads the default", async () => {
    const readDefault = vi.fn(async () => 5);
    await expect(resolveMonthlyBudget(20, readDefault)).resolves.toEqual({
      budgetUsd: 20,
      budgetSource: "workspace",
    });
    expect(readDefault).not.toHaveBeenCalled();
  });

  it("treats 0 as a real override (freezes the workspace)", async () => {
    await expect(resolveMonthlyBudget(0, async () => 5)).resolves.toEqual({
      budgetUsd: 0,
      budgetSource: "workspace",
    });
  });

  it("falls through to the default when there is no override", async () => {
    await expect(resolveMonthlyBudget(null, async () => 7)).resolves.toEqual({
      budgetUsd: 7,
      budgetSource: "default",
    });
  });

  it("ignores a nonsensical stored value rather than trusting it", async () => {
    await expect(
      resolveMonthlyBudget(Number.NaN, async () => 7)
    ).resolves.toEqual({ budgetUsd: 7, budgetSource: "default" });
    await expect(resolveMonthlyBudget(-1, async () => 7)).resolves.toEqual({
      budgetUsd: 7,
      budgetSource: "default",
    });
  });
});

describe("usageSummary", () => {
  it("without an override, uses the env default exactly as before", async () => {
    findUnique.mockResolvedValue({ aiMonthlyBudgetUsd: null });
    await expect(usageSummary("ws-1")).resolves.toEqual({
      workspaceId: "ws-1",
      monthUsd: 1.5,
      budgetUsd: 5,
      budgetSource: "default",
    });
    expect(getPlatformSetting).toHaveBeenCalledWith(
      "resumatch.aiMonthlyBudgetUsd",
      5
    );
  });

  it("without an override, an Admin platform setting still wins over env", async () => {
    findUnique.mockResolvedValue({ aiMonthlyBudgetUsd: null });
    getPlatformSetting.mockResolvedValue(12);
    await expect(usageSummary("ws-1")).resolves.toMatchObject({
      budgetUsd: 12,
      budgetSource: "default",
    });
  });

  it("a workspace override wins over the platform setting and env", async () => {
    findUnique.mockResolvedValue({ aiMonthlyBudgetUsd: decimal("25.50") });
    getPlatformSetting.mockResolvedValue(12);
    await expect(usageSummary("ws-1")).resolves.toMatchObject({
      budgetUsd: 25.5,
      budgetSource: "workspace",
    });
    expect(getPlatformSetting).not.toHaveBeenCalled();
  });

  it("an unknown workspace gets the default", async () => {
    findUnique.mockResolvedValue(null);
    await expect(usageSummary("missing")).resolves.toMatchObject({
      budgetUsd: 5,
      budgetSource: "default",
    });
  });
});

describe("assertCanRunProviderCall", () => {
  it("checks against the workspace's own ceiling, not the global default", async () => {
    // $1.50 spent: over a $1 override even though the $5 default has room.
    findUnique.mockResolvedValue({ aiMonthlyBudgetUsd: decimal("1.00") });
    const error = await assertCanRunProviderCall("ws-1", "tailor").catch(
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(QuotaExceededError);
    expect(error).toMatchObject({ budgetUsd: 1, monthUsd: 1.5 });
  });

  it("lets a call through when a raised override has room", async () => {
    ledgerAggregate.mockResolvedValue({ _sum: { costUsd: 6 } }); // over the $5 default
    findUnique.mockResolvedValue({ aiMonthlyBudgetUsd: decimal("50.00") });
    await expect(
      assertCanRunProviderCall("ws-1", "extract")
    ).resolves.toBeUndefined();
  });

  it("a 0 override refuses every call", async () => {
    ledgerAggregate.mockResolvedValue({ _sum: { costUsd: null } });
    queryRaw.mockResolvedValue([{ micros: null }]);
    findUnique.mockResolvedValue({ aiMonthlyBudgetUsd: decimal("0.00") });
    await expect(
      assertCanRunProviderCall("ws-1", "rewrite")
    ).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it("no override: unchanged behaviour against the default", async () => {
    findUnique.mockResolvedValue({ aiMonthlyBudgetUsd: null });
    await expect(
      assertCanRunProviderCall("ws-1", "tailor")
    ).resolves.toBeUndefined();
    ledgerAggregate.mockResolvedValue({ _sum: { costUsd: 5 } });
    await expect(
      assertCanRunProviderCall("ws-1", "tailor")
    ).rejects.toBeInstanceOf(QuotaExceededError);
  });
});

/**
 * Issue #756. The workspace queries filter on `workspaceId`; the global
 * ones don't. The mocks tell them apart by that, so a test can give the
 * workspace and the whole service different totals.
 */
function spend({ workspaceUsd, globalUsd }: { workspaceUsd: number; globalUsd: number }) {
  ledgerAggregate.mockImplementation(async (args: { where: { workspaceId?: string } }) => ({
    _sum: { costUsd: args.where.workspaceId ? workspaceUsd : globalUsd },
  }));
  queryRaw.mockImplementation(async () => [{ micros: 0n }]);
}

describe("global monthly ceiling (#756)", () => {
  it("is off when neither the env var nor an admin override sets it", async () => {
    await expect(globalMonthlyBudgetUsd()).resolves.toBeNull();
    expect(getPlatformSetting).toHaveBeenCalledWith("resumatch.aiGlobalMonthlyBudgetUsd", -1);
  });

  it("reads the env var, and an admin override wins over it", async () => {
    env.aiGlobalMonthlyBudgetUsd = 100;
    await expect(globalMonthlyBudgetUsd()).resolves.toBe(100);
    getPlatformSetting.mockImplementation(async () => 250);
    await expect(globalMonthlyBudgetUsd()).resolves.toBe(250);
  });

  it("refuses with scope global while the workspace is under its own budget", async () => {
    env.aiGlobalMonthlyBudgetUsd = 100;
    findUnique.mockResolvedValue({ aiMonthlyBudgetUsd: null });
    spend({ workspaceUsd: 1, globalUsd: 100 });
    const error = await assertCanRunProviderCall("ws-1", "tailor").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(QuotaExceededError);
    expect(error).toMatchObject({ scope: "global", code: "budget_global", budgetUsd: 100, monthUsd: 100 });
    // The outcome log records which ceiling refused (never the message).
    expect(errorCodeOf(error)).toBe("budget_global");
  });

  it("a workspace over its own budget is told so first, even when the service is out too", async () => {
    env.aiGlobalMonthlyBudgetUsd = 100;
    findUnique.mockResolvedValue({ aiMonthlyBudgetUsd: null });
    spend({ workspaceUsd: 5, globalUsd: 500 });
    const error = await assertCanRunProviderCall("ws-1", "tailor").catch((e: unknown) => e);
    expect(error).toMatchObject({ scope: "workspace", code: "budget_workspace" });
    expect(errorCodeOf(error)).toBe("budget_workspace");
  });

  it("lets a call through under both ceilings", async () => {
    env.aiGlobalMonthlyBudgetUsd = 100;
    findUnique.mockResolvedValue({ aiMonthlyBudgetUsd: null });
    spend({ workspaceUsd: 1, globalUsd: 99.99 });
    await expect(assertCanRunProviderCall("ws-1", "tailor")).resolves.toBeUndefined();
  });

  it("0 freezes every workspace", async () => {
    env.aiGlobalMonthlyBudgetUsd = 0;
    findUnique.mockResolvedValue({ aiMonthlyBudgetUsd: null });
    spend({ workspaceUsd: 0, globalUsd: 0 });
    await expect(assertCanRunProviderCall("ws-1", "tailor")).rejects.toMatchObject({ scope: "global" });
  });

  it("never sums all workspaces when no ceiling is set", async () => {
    findUnique.mockResolvedValue({ aiMonthlyBudgetUsd: null });
    spend({ workspaceUsd: 1, globalUsd: 1_000_000 });
    await expect(assertCanRunProviderCall("ws-1", "tailor")).resolves.toBeUndefined();
    const globalCalls = ledgerAggregate.mock.calls.filter(([args]) => !args.where.workspaceId);
    expect(globalCalls).toHaveLength(0);
  });

  it("sums the whole month from the 1st (UTC) without a workspace filter", async () => {
    env.aiGlobalMonthlyBudgetUsd = 100;
    findUnique.mockResolvedValue({ aiMonthlyBudgetUsd: null });
    spend({ workspaceUsd: 1, globalUsd: 2 });
    await assertCanRunProviderCall("ws-1", "tailor");
    const globalCall = ledgerAggregate.mock.calls.find(([args]) => !args.where.workspaceId);
    const since: Date = globalCall![0].where.createdAt.gte;
    expect(since.getUTCDate()).toBe(1);
    expect(since.getUTCHours()).toBe(0);
  });
});

describe("80% alert (#756)", () => {
  const now = new Date("2026-11-24T12:00:00Z");

  it("logs once per month when spend crosses 80% of the global ceiling", () => {
    expect(maybeAlertGlobalThreshold({ monthUsd: 79, budgetUsd: 100 }, now)).toBe(false);
    expect(maybeAlertGlobalThreshold({ monthUsd: 80, budgetUsd: 100 }, now)).toBe(true);
    expect(maybeAlertGlobalThreshold({ monthUsd: 95, budgetUsd: 100 }, now)).toBe(false);
    expect(logWarn).toHaveBeenCalledTimes(1);
    expect(logWarn).toHaveBeenCalledWith("ai.budget.global_threshold", {
      month: "2026-11",
      monthUsd: 80,
      budgetUsd: 100,
      reached: false,
    });
    // A new month warns again.
    expect(maybeAlertGlobalThreshold({ monthUsd: 90, budgetUsd: 100 }, new Date("2026-12-01T00:00:00Z"))).toBe(true);
  });

  it("stays quiet with no ceiling or a 0 ceiling", () => {
    expect(maybeAlertGlobalThreshold({ monthUsd: 10, budgetUsd: null }, now)).toBe(false);
    expect(maybeAlertGlobalThreshold({ monthUsd: 10, budgetUsd: 0 }, now)).toBe(false);
    expect(logWarn).not.toHaveBeenCalled();
  });
});

describe("budgetStatus (#756)", () => {
  it("reports the workspace's spend, its ceiling and the reset date", async () => {
    findUnique.mockResolvedValue({ aiMonthlyBudgetUsd: null });
    spend({ workspaceUsd: 1.25, globalUsd: 3 });
    await expect(budgetStatus("ws-1", new Date("2026-11-24T12:00:00Z"))).resolves.toMatchObject({
      monthUsd: 1.25,
      budgetUsd: 5,
      resetsOn: "2026-12-01",
      globalReached: false,
    });
  });

  it("says the service-wide ceiling is reached without exposing its amounts", async () => {
    env.aiGlobalMonthlyBudgetUsd = 3;
    findUnique.mockResolvedValue({ aiMonthlyBudgetUsd: null });
    spend({ workspaceUsd: 1, globalUsd: 3 });
    const status = await budgetStatus("ws-1");
    expect(status.globalReached).toBe(true);
    expect(Object.keys(status).sort()).toEqual(
      ["budgetSource", "budgetUsd", "globalReached", "monthUsd", "resetsOn", "workspaceId"].sort(),
    );
  });
});

describe("month rollover (#756)", () => {
  it("resets on the 1st of next month, across the year end", () => {
    expect(nextMonthStart(new Date("2026-11-30T23:59:59Z")).toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(nextMonthStart(new Date("2026-12-31T23:59:59Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(nextMonthStart(new Date("2026-12-01T00:00:00Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("degradedReasonOf (#756)", () => {
  it("tells the two ceilings apart from a provider failure", () => {
    expect(degradedReasonOf(new QuotaExceededError("x", 5, 5))).toBe("workspace_budget");
    expect(degradedReasonOf(new QuotaExceededError("x", 5, 5, "global"))).toBe("global_budget");
    expect(degradedReasonOf(new Error("timeout"))).toBe("provider");
    expect(degradedReasonOf(undefined)).toBe("provider");
  });
});
