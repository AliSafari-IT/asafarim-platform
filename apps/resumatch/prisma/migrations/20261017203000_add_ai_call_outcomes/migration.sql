-- #512: one outcome row per AI provider call (success, degrade or hard
-- failure). Additive: a new table only; AiUsageLedger and ai_cost_events are
-- untouched. Hand-written to match Prisma's generated SQL shape.

-- CreateTable
CREATE TABLE "ai_call_outcomes" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "degraded" BOOLEAN NOT NULL,
    "usedFallback" BOOLEAN NOT NULL DEFAULT false,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_call_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_call_outcomes_kind_createdAt_idx" ON "ai_call_outcomes"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "ai_call_outcomes_workspaceId_createdAt_idx" ON "ai_call_outcomes"("workspaceId", "createdAt");
