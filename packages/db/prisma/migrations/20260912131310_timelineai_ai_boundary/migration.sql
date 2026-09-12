-- CreateTable
CREATE TABLE "TimelineAiProposal" (
    "id" TEXT NOT NULL,
    "timelineId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payload" JSONB NOT NULL,
    "snapshot" JSONB,
    "createdByUserId" TEXT,
    "resolvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "TimelineAiProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineAiEvent" (
    "id" TEXT NOT NULL,
    "timelineId" TEXT NOT NULL,
    "proposalId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineAiEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimelineAiProposal_timelineId_idx" ON "TimelineAiProposal"("timelineId");

-- CreateIndex
CREATE INDEX "TimelineAiProposal_status_idx" ON "TimelineAiProposal"("status");

-- CreateIndex
CREATE INDEX "TimelineAiProposal_createdAt_idx" ON "TimelineAiProposal"("createdAt");

-- CreateIndex
CREATE INDEX "TimelineAiEvent_timelineId_idx" ON "TimelineAiEvent"("timelineId");

-- CreateIndex
CREATE INDEX "TimelineAiEvent_proposalId_idx" ON "TimelineAiEvent"("proposalId");

-- CreateIndex
CREATE INDEX "TimelineAiEvent_action_idx" ON "TimelineAiEvent"("action");

-- CreateIndex
CREATE INDEX "TimelineAiEvent_createdAt_idx" ON "TimelineAiEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "TimelineAiProposal" ADD CONSTRAINT "TimelineAiProposal_timelineId_fkey" FOREIGN KEY ("timelineId") REFERENCES "Timeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineAiProposal" ADD CONSTRAINT "TimelineAiProposal_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineAiEvent" ADD CONSTRAINT "TimelineAiEvent_timelineId_fkey" FOREIGN KEY ("timelineId") REFERENCES "Timeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineAiEvent" ADD CONSTRAINT "TimelineAiEvent_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "TimelineAiProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineAiEvent" ADD CONSTRAINT "TimelineAiEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
