-- CreateTable
CREATE TABLE "AiCostReconciliationRun" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "triggeredBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startDay" TEXT NOT NULL,
    "endDay" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "sources" JSONB NOT NULL DEFAULT '[]',
    "summary" JSONB,
    "error" TEXT,

    CONSTRAINT "AiCostReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCostReconciliationLine" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountKey" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "modelKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "finality" TEXT NOT NULL,
    "providerMicros" BIGINT,
    "internalKnownMicros" BIGINT NOT NULL,
    "internalEventCount" INTEGER NOT NULL,
    "internalUnknownCount" INTEGER NOT NULL,
    "deltaMicros" BIGINT,
    "unattributedMicros" BIGINT,
    "coverageBps" INTEGER,
    "driftBps" INTEGER,
    "apps" TEXT[],
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCostReconciliationLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiCostReconciliationRun_startedAt_idx" ON "AiCostReconciliationRun"("startedAt" DESC);

-- CreateIndex
CREATE INDEX "AiCostReconciliationRun_status_idx" ON "AiCostReconciliationRun"("status");

-- CreateIndex
CREATE INDEX "AiCostReconciliationLine_provider_accountKey_day_modelKey_o_idx" ON "AiCostReconciliationLine"("provider", "accountKey", "day", "modelKey", "observedAt" DESC);

-- CreateIndex
CREATE INDEX "AiCostReconciliationLine_day_idx" ON "AiCostReconciliationLine"("day");

-- CreateIndex
CREATE UNIQUE INDEX "AiCostReconciliationLine_runId_provider_accountKey_day_mode_key" ON "AiCostReconciliationLine"("runId", "provider", "accountKey", "day", "modelKey");

-- AddForeignKey
ALTER TABLE "AiCostReconciliationLine" ADD CONSTRAINT "AiCostReconciliationLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiCostReconciliationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
