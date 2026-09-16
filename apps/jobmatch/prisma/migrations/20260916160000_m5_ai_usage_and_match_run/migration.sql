-- M5: model/prompt/budget controls + honest degraded mode (JM-047).
--
-- Hand-written rather than `prisma migrate dev`-generated: no live Postgres
-- was reachable in the sandbox this was authored in (Docker Desktop was not
-- running). Written to match Prisma's own generated SQL shape and naming
-- convention exactly, following 20260916150000_m5_match_embeddings's
-- precedent, so `prisma migrate deploy` applies it identically to one Prisma
-- would have produced itself.

-- CreateTable
CREATE TABLE "ai_usage_ledger" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_run" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "profileVersionId" TEXT NOT NULL,
    "postingId" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "evaluationModelVersion" TEXT NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "degraded" BOOLEAN NOT NULL DEFAULT false,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_ledger_workspaceId_createdAt_idx" ON "ai_usage_ledger"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "match_run_workspaceId_profileVersionId_postingId_promptVer_key" ON "match_run"("workspaceId", "profileVersionId", "postingId", "promptVersion", "evaluationModelVersion");

-- CreateIndex
CREATE INDEX "match_run_workspaceId_createdAt_idx" ON "match_run"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "match_run_profileVersionId_idx" ON "match_run"("profileVersionId");
