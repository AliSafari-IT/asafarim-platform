-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('JSON_FEED', 'PARTNER_API');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "PostingStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'DUPLICATE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "RunOutcome" AS ENUM ('SUCCEEDED', 'PARTIAL', 'FAILED', 'REFUSED');

-- CreateTable
CREATE TABLE "job_sources" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "endpoint" TEXT NOT NULL,
    "status" "SourceStatus" NOT NULL DEFAULT 'DRAFT',
    "syncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "agreementReference" TEXT,
    "agreementExpiresAt" TIMESTAMP(3),
    "attributionText" TEXT,
    "commercialUse" BOOLEAN,
    "requestsPerMinute" INTEGER NOT NULL DEFAULT 20,
    "snapshotRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "lastSyncStartedAt" TIMESTAMP(3),
    "lastSyncFinishedAt" TIMESTAMP(3),
    "lastEtag" TEXT,
    "lastModified" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_snapshots" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "payload" TEXT,
    "byteSize" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retainUntil" TIMESTAMP(3) NOT NULL,
    "normalizerVersion" TEXT,

    CONSTRAINT "job_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_postings" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "externalId" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "employer" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "language" TEXT,
    "locationRaw" TEXT,
    "isRemote" BOOLEAN,
    "contractType" TEXT,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "salaryCurrency" TEXT,
    "salaryPeriod" TEXT,
    "skillsRaw" TEXT[],
    "contentHash" TEXT NOT NULL,
    "canonicalKey" TEXT NOT NULL,
    "duplicateOfId" TEXT,
    "status" "PostingStatus" NOT NULL DEFAULT 'ACTIVE',
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceUpdatedAt" TIMESTAMP(3),
    "normalizerVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_postings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_runs" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "outcome" "RunOutcome",
    "reasonCode" TEXT,
    "recordsFetched" INTEGER NOT NULL DEFAULT 0,
    "recordsAdded" INTEGER NOT NULL DEFAULT 0,
    "recordsUpdated" INTEGER NOT NULL DEFAULT 0,
    "recordsExpired" INTEGER NOT NULL DEFAULT 0,
    "duplicatesFound" INTEGER NOT NULL DEFAULT 0,
    "parseFailures" INTEGER NOT NULL DEFAULT 0,
    "rateLimitedCount" INTEGER NOT NULL DEFAULT 0,
    "notModified" BOOLEAN NOT NULL DEFAULT false,
    "durationMs" INTEGER,

    CONSTRAINT "ingestion_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_sources_key_key" ON "job_sources"("key");

-- CreateIndex
CREATE INDEX "job_snapshots_sourceId_capturedAt_idx" ON "job_snapshots"("sourceId", "capturedAt");

-- CreateIndex
CREATE INDEX "job_snapshots_retainUntil_idx" ON "job_snapshots"("retainUntil");

-- CreateIndex
CREATE UNIQUE INDEX "job_snapshots_sourceId_contentHash_key" ON "job_snapshots"("sourceId", "contentHash");

-- CreateIndex
CREATE INDEX "job_postings_canonicalKey_idx" ON "job_postings"("canonicalKey");

-- CreateIndex
CREATE INDEX "job_postings_status_lastSeenAt_idx" ON "job_postings"("status", "lastSeenAt");

-- CreateIndex
CREATE INDEX "job_postings_sourceId_status_idx" ON "job_postings"("sourceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "job_postings_sourceId_externalId_key" ON "job_postings"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX "ingestion_runs_sourceId_startedAt_idx" ON "ingestion_runs"("sourceId", "startedAt");

-- AddForeignKey
ALTER TABLE "job_snapshots" ADD CONSTRAINT "job_snapshots_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "job_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "job_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "job_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "job_postings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_runs" ADD CONSTRAINT "ingestion_runs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "job_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
