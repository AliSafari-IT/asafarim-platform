-- CreateEnum
CREATE TYPE "AiJobState" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'degraded');

-- CreateEnum
CREATE TYPE "ProposalState" AS ENUM ('draft', 'previewed', 'applied', 'partially_applied', 'rejected', 'undone', 'regenerating');

-- CreateTable
CREATE TABLE "ai_job" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "state" "AiJobState" NOT NULL DEFAULT 'queued',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" DOUBLE PRECISION,
    "latencyMs" INTEGER,
    "error" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_ledger" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "aiJobId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fixture" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_settings" (
    "workspaceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "monthlyBudgetUsd" DOUBLE PRECISION,
    "monthlyJobQuota" INTEGER,
    "maxBlastRadius" INTEGER NOT NULL DEFAULT 50,
    "provider" TEXT NOT NULL DEFAULT 'fixture',
    "model" TEXT NOT NULL DEFAULT 'fixture-1',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "proposal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "aiJobId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "state" "ProposalState" NOT NULL DEFAULT 'draft',
    "operations" JSONB NOT NULL,
    "undoPlan" JSONB,
    "summary" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_job_workspaceId_state_idx" ON "ai_job"("workspaceId", "state");

-- CreateIndex
CREATE INDEX "ai_job_workspaceId_cacheKey_idx" ON "ai_job"("workspaceId", "cacheKey");

-- CreateIndex
CREATE INDEX "ai_usage_ledger_workspaceId_createdAt_idx" ON "ai_usage_ledger"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "proposal_aiJobId_key" ON "proposal"("aiJobId");

-- CreateIndex
CREATE INDEX "proposal_workspaceId_state_idx" ON "proposal"("workspaceId", "state");

-- AddForeignKey
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_aiJobId_fkey" FOREIGN KEY ("aiJobId") REFERENCES "ai_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
