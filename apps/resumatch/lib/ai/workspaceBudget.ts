import { z } from "zod";
import { getJobmatchDb } from "../db/client";
import { usageSummary, type BudgetSource } from "../tailoring/ai/quota";
import { recordAuditEvent } from "../workspace";

/**
 * Operator-side read/write of a workspace's monthly AI budget override
 * (issue #514). The budget check itself lives in lib/tailoring/ai/quota.ts;
 * this module only stores the override and reports spend against it.
 */

/** Upper bound for an override, as a typo guard (not a business limit). */
export const MAX_WORKSPACE_BUDGET_USD = 100_000;

const budgetUsd = z
  .number()
  .finite()
  .min(0)
  .max(MAX_WORKSPACE_BUDGET_USD)
  .refine((value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6, {
    message: "at most 2 decimal places",
  });

export const workspaceBudgetUpdateSchema = z
  .object({
    workspaceId: z.string().trim().min(1).max(64),
    /** `null` clears the override (back to the platform default). */
    budgetUsd: budgetUsd.nullable(),
  })
  .strict();

export type WorkspaceBudgetUpdate = z.infer<typeof workspaceBudgetUpdateSchema>;

export interface WorkspaceBudgetView {
  workspaceId: string;
  /** This month's known spend in USD (same figure the budget check uses). */
  monthUsd: number;
  /** The ceiling in effect right now. */
  budgetUsd: number;
  budgetSource: BudgetSource;
  /** The stored override, or null when the default applies. */
  overrideUsd: number | null;
}

async function readOverride(
  workspaceId: string
): Promise<{ overrideUsd: number | null } | null> {
  const row = await getJobmatchDb().workspace.findUnique({
    where: { id: workspaceId },
    select: { aiMonthlyBudgetUsd: true },
  });
  if (!row) return null;
  return {
    overrideUsd:
      row.aiMonthlyBudgetUsd === null ? null : Number(row.aiMonthlyBudgetUsd),
  };
}

/** Spend vs budget for one workspace; null when the workspace doesn't exist. */
export async function getWorkspaceBudget(
  workspaceId: string
): Promise<WorkspaceBudgetView | null> {
  const stored = await readOverride(workspaceId);
  if (!stored) return null;
  const summary = await usageSummary(workspaceId);
  return {
    workspaceId,
    monthUsd: summary.monthUsd,
    budgetUsd: summary.budgetUsd,
    budgetSource: summary.budgetSource,
    overrideUsd: stored.overrideUsd,
  };
}

/**
 * Sets (or, with `null`, clears) a workspace's override and records an
 * audit event with the old and new values only. Returns the new view, or
 * null when the workspace doesn't exist (nothing is written then).
 */
export async function setWorkspaceBudget(
  update: WorkspaceBudgetUpdate
): Promise<WorkspaceBudgetView | null> {
  const stored = await readOverride(update.workspaceId);
  if (!stored) return null;

  await getJobmatchDb().workspace.update({
    where: { id: update.workspaceId },
    data: { aiMonthlyBudgetUsd: update.budgetUsd },
  });
  await recordAuditEvent(update.workspaceId, "workspace.ai_budget.set", {
    previousBudgetUsd: stored.overrideUsd,
    budgetUsd: update.budgetUsd,
  });

  return getWorkspaceBudget(update.workspaceId);
}
