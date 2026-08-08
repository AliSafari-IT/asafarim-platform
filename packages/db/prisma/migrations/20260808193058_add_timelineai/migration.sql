-- AlterTable
ALTER TABLE "NewsletterSubscriber" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Timeline" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "guestIdHash" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "timelineType" TEXT NOT NULL DEFAULT 'general',
    "layout" TEXT NOT NULL DEFAULT 'vertical',
    "theme" JSONB,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "moderationStatus" TEXT NOT NULL DEFAULT 'not_required',
    "moderationReason" TEXT,
    "editingState" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "Timeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL,
    "timelineId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "displayDate" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "imageStorageKey" TEXT,
    "icon" TEXT,
    "label" TEXT,
    "link" TEXT,
    "accentColor" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineModerationEvent" (
    "id" TEXT NOT NULL,
    "timelineId" TEXT NOT NULL,
    "adminUserId" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineModerationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Timeline_publicId_key" ON "Timeline"("publicId");

-- CreateIndex
CREATE INDEX "Timeline_ownerUserId_idx" ON "Timeline"("ownerUserId");

-- CreateIndex
CREATE INDEX "Timeline_guestIdHash_idx" ON "Timeline"("guestIdHash");

-- CreateIndex
CREATE INDEX "Timeline_visibility_idx" ON "Timeline"("visibility");

-- CreateIndex
CREATE INDEX "Timeline_moderationStatus_idx" ON "Timeline"("moderationStatus");

-- CreateIndex
CREATE INDEX "Timeline_editingState_idx" ON "Timeline"("editingState");

-- CreateIndex
CREATE INDEX "Timeline_createdAt_idx" ON "Timeline"("createdAt");

-- CreateIndex
CREATE INDEX "TimelineEvent_timelineId_idx" ON "TimelineEvent"("timelineId");

-- CreateIndex
CREATE INDEX "TimelineEvent_timelineId_sortOrder_idx" ON "TimelineEvent"("timelineId", "sortOrder");

-- CreateIndex
CREATE INDEX "TimelineEvent_timelineId_startAt_idx" ON "TimelineEvent"("timelineId", "startAt");

-- CreateIndex
CREATE INDEX "TimelineModerationEvent_timelineId_idx" ON "TimelineModerationEvent"("timelineId");

-- CreateIndex
CREATE INDEX "TimelineModerationEvent_adminUserId_idx" ON "TimelineModerationEvent"("adminUserId");

-- CreateIndex
CREATE INDEX "TimelineModerationEvent_action_idx" ON "TimelineModerationEvent"("action");

-- CreateIndex
CREATE INDEX "TimelineModerationEvent_createdAt_idx" ON "TimelineModerationEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "Timeline" ADD CONSTRAINT "Timeline_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_timelineId_fkey" FOREIGN KEY ("timelineId") REFERENCES "Timeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineModerationEvent" ADD CONSTRAINT "TimelineModerationEvent_timelineId_fkey" FOREIGN KEY ("timelineId") REFERENCES "Timeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineModerationEvent" ADD CONSTRAINT "TimelineModerationEvent_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
