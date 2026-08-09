-- CreateTable
CREATE TABLE "SeedOperation" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "stage" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "requestedByUserId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "planChecksum" TEXT,
    "definitionVersion" TEXT,
    "definitionChecksum" TEXT,
    "planSummary" JSONB,
    "resultSummary" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "mutationStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "cancellationRequestedAt" TIMESTAMP(3),
    "retryOfOperationId" TEXT,
    "bulkGroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeedOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedOperationEvent" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeedOperationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedValidationSchedule" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cadence" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeedValidationSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeedOperation_idempotencyKey_key" ON "SeedOperation"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SeedOperation_providerId_environment_status_idx" ON "SeedOperation"("providerId", "environment", "status");

-- CreateIndex
CREATE INDEX "SeedOperation_requestedByUserId_idx" ON "SeedOperation"("requestedByUserId");

-- CreateIndex
CREATE INDEX "SeedOperation_createdAt_idx" ON "SeedOperation"("createdAt");

-- CreateIndex
CREATE INDEX "SeedOperation_status_heartbeatAt_idx" ON "SeedOperation"("status", "heartbeatAt");

-- CreateIndex
CREATE INDEX "SeedOperation_bulkGroupId_idx" ON "SeedOperation"("bulkGroupId");

-- CreateIndex
CREATE INDEX "SeedOperationEvent_operationId_createdAt_idx" ON "SeedOperationEvent"("operationId", "createdAt");

-- CreateIndex
CREATE INDEX "SeedOperationEvent_level_idx" ON "SeedOperationEvent"("level");

-- CreateIndex
CREATE UNIQUE INDEX "SeedValidationSchedule_providerId_environment_key" ON "SeedValidationSchedule"("providerId", "environment");

-- CreateIndex
CREATE INDEX "SeedValidationSchedule_enabled_nextRunAt_idx" ON "SeedValidationSchedule"("enabled", "nextRunAt");

-- AddForeignKey
ALTER TABLE "SeedOperation" ADD CONSTRAINT "SeedOperation_retryOfOperationId_fkey" FOREIGN KEY ("retryOfOperationId") REFERENCES "SeedOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedOperation" ADD CONSTRAINT "SeedOperation_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedOperationEvent" ADD CONSTRAINT "SeedOperationEvent_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "SeedOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedValidationSchedule" ADD CONSTRAINT "SeedValidationSchedule_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedValidationSchedule" ADD CONSTRAINT "SeedValidationSchedule_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
