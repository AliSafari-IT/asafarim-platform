import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("../db/client", () => ({
  getJobmatchDb: () => ({
    workspace: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
    },
  }),
}));

const usageSummary = vi.fn();
vi.mock("../tailoring/ai/quota", () => ({
  usageSummary: (...a: unknown[]) => usageSummary(...a),
}));

const recordAuditEvent = vi.fn();
vi.mock("../workspace", () => ({
  recordAuditEvent: (...a: unknown[]) => recordAuditEvent(...a),
}));

import {
  getWorkspaceBudget,
  setWorkspaceBudget,
  workspaceBudgetUpdateSchema,
} from "./workspaceBudget";

beforeEach(() => {
  findUnique.mockReset();
  update.mockReset().mockResolvedValue({});
  recordAuditEvent.mockReset().mockResolvedValue(undefined);
  usageSummary
    .mockReset()
    .mockResolvedValue({
      workspaceId: "ws-1",
      monthUsd: 2,
      budgetUsd: 10,
      budgetSource: "workspace",
    });
});

describe("workspaceBudgetUpdateSchema", () => {
  const ok = (body: unknown) =>
    workspaceBudgetUpdateSchema.safeParse(body).success;

  it("accepts a budget, zero, and null (clear)", () => {
    expect(ok({ workspaceId: "ws-1", budgetUsd: 12.5 })).toBe(true);
    expect(ok({ workspaceId: "ws-1", budgetUsd: 0 })).toBe(true);
    expect(ok({ workspaceId: "ws-1", budgetUsd: null })).toBe(true);
  });

  it("rejects negative, too large, non-finite, over-precise and missing values", () => {
    expect(ok({ workspaceId: "ws-1", budgetUsd: -1 })).toBe(false);
    expect(ok({ workspaceId: "ws-1", budgetUsd: 100_000.01 })).toBe(false);
    expect(
      ok({ workspaceId: "ws-1", budgetUsd: Number.POSITIVE_INFINITY })
    ).toBe(false);
    expect(ok({ workspaceId: "ws-1", budgetUsd: 1.005 })).toBe(false);
    expect(ok({ workspaceId: "ws-1", budgetUsd: "10" })).toBe(false);
    expect(ok({ workspaceId: "ws-1" })).toBe(false);
    expect(ok({ workspaceId: "", budgetUsd: 1 })).toBe(false);
  });

  it("rejects unknown fields", () => {
    expect(ok({ workspaceId: "ws-1", budgetUsd: 1, platformUserId: "x" })).toBe(
      false
    );
  });
});

describe("getWorkspaceBudget", () => {
  it("returns null for an unknown workspace without reading spend", async () => {
    findUnique.mockResolvedValue(null);
    await expect(getWorkspaceBudget("missing")).resolves.toBeNull();
    expect(usageSummary).not.toHaveBeenCalled();
  });

  it("reports spend, the budget in effect and the stored override", async () => {
    findUnique.mockResolvedValue({ aiMonthlyBudgetUsd: { valueOf: () => 10 } });
    await expect(getWorkspaceBudget("ws-1")).resolves.toEqual({
      workspaceId: "ws-1",
      monthUsd: 2,
      budgetUsd: 10,
      budgetSource: "workspace",
      overrideUsd: 10,
    });
  });
});

describe("setWorkspaceBudget", () => {
  it("stores the override and audits old and new values only", async () => {
    findUnique.mockResolvedValue({ aiMonthlyBudgetUsd: null });
    await setWorkspaceBudget({ workspaceId: "ws-1", budgetUsd: 10 });
    expect(update).toHaveBeenCalledWith({
      where: { id: "ws-1" },
      data: { aiMonthlyBudgetUsd: 10 },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "ws-1",
      "workspace.ai_budget.set",
      {
        previousBudgetUsd: null,
        budgetUsd: 10,
      }
    );
  });

  it("clears the override with null", async () => {
    findUnique.mockResolvedValue({ aiMonthlyBudgetUsd: { valueOf: () => 10 } });
    await setWorkspaceBudget({ workspaceId: "ws-1", budgetUsd: null });
    expect(update).toHaveBeenCalledWith({
      where: { id: "ws-1" },
      data: { aiMonthlyBudgetUsd: null },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "ws-1",
      "workspace.ai_budget.set",
      {
        previousBudgetUsd: 10,
        budgetUsd: null,
      }
    );
  });

  it("writes nothing for an unknown workspace", async () => {
    findUnique.mockResolvedValue(null);
    await expect(
      setWorkspaceBudget({ workspaceId: "missing", budgetUsd: 1 })
    ).resolves.toBeNull();
    expect(update).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});
