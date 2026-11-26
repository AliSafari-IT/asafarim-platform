-- External application tracking and the application timeline
-- (application-timeline.md). Additive: every new Application column is
-- nullable, so existing rows read exactly as before.

CREATE TYPE "SubmissionChannel" AS ENUM ('INDEED', 'LINKEDIN', 'COMPANY_WEBSITE', 'OTHER');
CREATE TYPE "ApplicationEventKind" AS ENUM ('SUBMITTED', 'CONFIRMATION_RECEIVED', 'RECRUITER_REPLY', 'RESPONSE_SENT', 'INTERVIEW', 'FOLLOW_UP', 'OFFER', 'REJECTION', 'NOTE');
CREATE TYPE "ApplicationEventOrigin" AS ENUM ('MANUAL', 'EXTERNAL_SUBMISSION');
CREATE TYPE "ApplicationAttachmentKind" AS ENUM ('IMAGE', 'PDF', 'EMAIL');

ALTER TABLE "applications"
    ADD COLUMN "appliedTimeZone" TEXT,
    ADD COLUMN "submissionChannel" "SubmissionChannel",
    ADD COLUMN "submissionChannelLabel" TEXT,
    ADD COLUMN "applicationUrl" TEXT,
    ADD COLUMN "submissionReference" TEXT,
    ADD COLUMN "submissionRecordedAt" TIMESTAMP(3);

CREATE TABLE "application_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "kind" "ApplicationEventKind" NOT NULL,
    "origin" "ApplicationEventOrigin" NOT NULL DEFAULT 'MANUAL',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "timeZone" TEXT NOT NULL,
    "summary" TEXT,
    "sender" TEXT,
    "recipient" TEXT,
    "nextAction" TEXT,
    "followUpDate" TIMESTAMP(3),
    "fromStatus" "ApplicationStatus",
    "toStatus" "ApplicationStatus",
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "application_events_idempotencyKey_key" ON "application_events"("idempotencyKey");
CREATE INDEX "application_events_applicationId_occurredAt_idx" ON "application_events"("applicationId", "occurredAt");
CREATE INDEX "application_events_workspaceId_idx" ON "application_events"("workspaceId");

ALTER TABLE "application_events" ADD CONSTRAINT "application_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "application_event_attachments" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" "ApplicationAttachmentKind" NOT NULL,
    "contentType" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "emailPreview" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_event_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "application_event_attachments_storageKey_key" ON "application_event_attachments"("storageKey");
CREATE UNIQUE INDEX "application_event_attachments_eventId_contentHash_key" ON "application_event_attachments"("eventId", "contentHash");
CREATE INDEX "application_event_attachments_workspaceId_idx" ON "application_event_attachments"("workspaceId");

ALTER TABLE "application_event_attachments" ADD CONSTRAINT "application_event_attachments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "application_event_attachments" ADD CONSTRAINT "application_event_attachments_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "application_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
