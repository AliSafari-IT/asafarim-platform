-- Issue #514: optional per-workspace monthly AI budget override (USD).
-- Additive and nullable: existing workspaces keep the platform/env default.
ALTER TABLE "workspaces" ADD COLUMN "aiMonthlyBudgetUsd" DECIMAL(10,2);
