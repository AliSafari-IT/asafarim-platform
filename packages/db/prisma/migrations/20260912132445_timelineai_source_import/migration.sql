-- CreateTable
CREATE TABLE "TimelineSourceImport" (
    "id" TEXT NOT NULL,
    "timelineId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "chunkCount" INTEGER NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineSourceImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineImportedEvent" (
    "id" TEXT NOT NULL,
    "timelineId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "chunkId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineImportedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimelineSourceImport_timelineId_idx" ON "TimelineSourceImport"("timelineId");

-- CreateIndex
CREATE UNIQUE INDEX "TimelineSourceImport_timelineId_contentHash_key" ON "TimelineSourceImport"("timelineId", "contentHash");

-- CreateIndex
CREATE INDEX "TimelineImportedEvent_timelineId_idx" ON "TimelineImportedEvent"("timelineId");

-- CreateIndex
CREATE INDEX "TimelineImportedEvent_eventId_idx" ON "TimelineImportedEvent"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "TimelineImportedEvent_timelineId_contentHash_chunkId_key" ON "TimelineImportedEvent"("timelineId", "contentHash", "chunkId");

-- AddForeignKey
ALTER TABLE "TimelineSourceImport" ADD CONSTRAINT "TimelineSourceImport_timelineId_fkey" FOREIGN KEY ("timelineId") REFERENCES "Timeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineSourceImport" ADD CONSTRAINT "TimelineSourceImport_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineImportedEvent" ADD CONSTRAINT "TimelineImportedEvent_timelineId_fkey" FOREIGN KEY ("timelineId") REFERENCES "Timeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
