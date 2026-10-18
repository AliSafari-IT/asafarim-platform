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
vi.mock("../../env", () => ({ getEnv: () => ({ aiMonthlyBudgetUsd: 5 }) }));

import {
  QuotaExceededError,
  assertCanRunProviderCall,
  resolveMonthlyBudget,
  usageSummary,
} from "./quota";

/** Prisma returns Decimal columns as objects; Number() is how quota reads them. */
const decimal = (value: string) => ({
  toString: () => value,
  valueOf: () => Number(value),
});

beforeEach(() => {
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
