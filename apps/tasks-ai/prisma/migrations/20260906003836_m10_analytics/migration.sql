-- CreateTable
CREATE TABLE "key_result" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "currentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "key_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "spentOn" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_snapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "defVersion" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecast" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "remaining" INTEGER NOT NULL,
    "bands" JSONB NOT NULL,
    "assumptions" JSONB NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'throughput-sample@1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forecast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "key_result_workspaceId_goalId_idx" ON "key_result"("workspaceId", "goalId");

-- CreateIndex
CREATE INDEX "time_entry_workspaceId_taskId_idx" ON "time_entry"("workspaceId", "taskId");

-- CreateIndex
CREATE INDEX "time_entry_workspaceId_spentOn_idx" ON "time_entry"("workspaceId", "spentOn");

-- CreateIndex
CREATE INDEX "metric_snapshot_workspaceId_scope_metric_createdAt_idx" ON "metric_snapshot"("workspaceId", "scope", "metric", "createdAt");

-- CreateIndex
CREATE INDEX "forecast_workspaceId_scope_createdAt_idx" ON "forecast"("workspaceId", "scope", "createdAt");
