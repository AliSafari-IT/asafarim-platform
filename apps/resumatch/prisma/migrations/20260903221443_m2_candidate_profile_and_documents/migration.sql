-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED', 'SCANNING', 'QUARANTINED', 'CLEAN', 'EXTRACTING', 'EXTRACTED', 'FAILED');

-- CreateEnum
CREATE TYPE "DocumentReasonCode" AS ENUM ('MALWARE_DETECTED', 'SCANNER_UNAVAILABLE', 'UNSUPPORTED_TYPE', 'DECLARED_TYPE_MISMATCH', 'FILE_TOO_LARGE', 'EMPTY_FILE', 'ENCRYPTED_DOCUMENT', 'NO_TEXT_LAYER', 'EXTRACTION_ERROR');

-- CreateEnum
CREATE TYPE "ProfileVersionOrigin" AS ENUM ('EXTRACTED', 'CORRECTED', 'MANUAL');

-- CreateTable
CREATE TABLE "candidate_documents" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "reasonCode" "DocumentReasonCode",
    "scannerName" TEXT,
    "scannedAt" TIMESTAMP(3),
    "extractionAttempts" INTEGER NOT NULL DEFAULT 0,
    "extractionStartedAt" TIMESTAMP(3),
    "retainUntil" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "candidate_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_profiles" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "confirmedVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_profile_versions" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "origin" "ProfileVersionOrigin" NOT NULL,
    "parentVersionId" TEXT,
    "documentId" TEXT,
    "sourceContentHash" TEXT,
    "extractorName" TEXT NOT NULL,
    "extractorVersion" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "confidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_profile_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "candidate_documents_storageKey_key" ON "candidate_documents"("storageKey");

-- CreateIndex
CREATE INDEX "candidate_documents_workspaceId_uploadedAt_idx" ON "candidate_documents"("workspaceId", "uploadedAt");

-- CreateIndex
CREATE INDEX "candidate_documents_workspaceId_status_idx" ON "candidate_documents"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "candidate_documents_workspaceId_contentHash_idx" ON "candidate_documents"("workspaceId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_profiles_workspaceId_key" ON "candidate_profiles"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_profiles_confirmedVersionId_key" ON "candidate_profiles"("confirmedVersionId");

-- CreateIndex
CREATE INDEX "candidate_profile_versions_profileId_createdAt_idx" ON "candidate_profile_versions"("profileId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_profile_versions_profileId_versionNumber_key" ON "candidate_profile_versions"("profileId", "versionNumber");

-- AddForeignKey
ALTER TABLE "candidate_documents" ADD CONSTRAINT "candidate_documents_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_confirmedVersionId_fkey" FOREIGN KEY ("confirmedVersionId") REFERENCES "candidate_profile_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_profile_versions" ADD CONSTRAINT "candidate_profile_versions_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_profile_versions" ADD CONSTRAINT "candidate_profile_versions_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "candidate_profile_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_profile_versions" ADD CONSTRAINT "candidate_profile_versions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "candidate_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
