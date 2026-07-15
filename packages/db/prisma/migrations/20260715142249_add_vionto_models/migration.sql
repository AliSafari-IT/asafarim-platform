-- CreateTable
CREATE TABLE "ViontoProject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'story',
    "storyMode" TEXT DEFAULT 'memory_film',
    "emotionalTone" TEXT DEFAULT 'nostalgic',
    "visualStyle" TEXT DEFAULT 'clean_modern_slideshow',
    "subtitleSettings" JSONB,
    "musicOption" TEXT DEFAULT 'no_music',
    "musicTrackId" TEXT,
    "musicUploadKey" TEXT,
    "musicMetadata" JSONB,
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "aspectRatio" TEXT NOT NULL DEFAULT '16:9',
    "resolution" TEXT,
    "targetDurationSeconds" INTEGER,
    "retentionPolicy" TEXT NOT NULL DEFAULT 'soft_delete',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViontoProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViontoProjectShare" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sharedByUserId" TEXT NOT NULL,
    "sharedWithUserId" TEXT,
    "email" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'viewer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ViontoProjectShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViontoAsset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'source_image',
    "originalUrl" TEXT,
    "thumbnailUrl" TEXT,
    "storageKey" TEXT,
    "thumbnailStorageKey" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "fileSizeBytes" INTEGER,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "caption" TEXT,
    "captionProvider" TEXT,
    "captionModel" TEXT,
    "captionGeneratedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "moderationOutcome" TEXT,
    "moderationCategory" TEXT,
    "moderationReason" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViontoAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViontoScript" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionId" TEXT,
    "userId" TEXT NOT NULL,
    "promptVersion" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "narrationText" TEXT,
    "srtText" TEXT,
    "musicOption" TEXT,
    "musicTrackId" TEXT,
    "musicMetadata" JSONB,
    "isUserEdited" BOOLEAN NOT NULL DEFAULT false,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "latencyMs" INTEGER,
    "moderationOutcome" TEXT,
    "moderationCategory" TEXT,
    "moderationReason" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViontoScript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViontoAudioTrack" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionId" TEXT,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'narration',
    "source" TEXT NOT NULL DEFAULT 'tts',
    "voiceId" TEXT,
    "voiceName" TEXT,
    "durationSeconds" INTEGER,
    "storageKey" TEXT,
    "mixSettings" JSONB,
    "moderationOutcome" TEXT,
    "moderationCategory" TEXT,
    "moderationReason" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViontoAudioTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViontoRenderJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionId" TEXT,
    "userId" TEXT NOT NULL,
    "queueId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "logs" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViontoRenderJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViontoExport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionId" TEXT,
    "renderJobId" TEXT,
    "userId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "durationSeconds" INTEGER,
    "fileSizeBytes" INTEGER,
    "format" TEXT NOT NULL DEFAULT 'mp4',
    "resolution" TEXT,
    "filename" TEXT,
    "userMode" TEXT,
    "renderMode" TEXT,
    "aspectRatio" TEXT,
    "aspectLabel" TEXT,
    "visualStyle" TEXT,
    "storyMode" TEXT,
    "emotionalTone" TEXT,
    "storyKeywords" JSONB,
    "previewTitle" TEXT,
    "previewSubtitle" TEXT,
    "musicOption" TEXT,
    "musicTrackId" TEXT,
    "musicMetadata" JSONB,
    "signedUrl" TEXT,
    "signedUrlExpiresAt" TIMESTAMP(3),
    "moderationOutcome" TEXT,
    "moderationCategory" TEXT,
    "moderationReason" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViontoExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViontoAuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "prevState" TEXT,
    "nextState" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ViontoAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViontoVideoVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "albumId" TEXT,
    "name" TEXT NOT NULL DEFAULT 'Version 1',
    "templateId" TEXT,
    "templateSettings" JSONB,
    "mode" TEXT NOT NULL DEFAULT 'story',
    "storyMode" TEXT DEFAULT 'memory_film',
    "emotionalTone" TEXT DEFAULT 'nostalgic',
    "visualStyle" TEXT DEFAULT 'clean_modern_slideshow',
    "subtitleSettings" JSONB,
    "musicOption" TEXT DEFAULT 'no_music',
    "musicTrackId" TEXT,
    "musicUploadKey" TEXT,
    "musicMetadata" JSONB,
    "aspectRatio" TEXT NOT NULL DEFAULT '16:9',
    "resolution" TEXT,
    "targetDurationSeconds" INTEGER,
    "storyStructure" JSONB,
    "captionOverlaySettings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViontoVideoVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViontoAlbum" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "coverAssetId" TEXT,
    "metadata" JSONB,
    "lifecycleStage" TEXT NOT NULL DEFAULT 'draft',
    "collections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "location" TEXT,
    "people" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "occasion" TEXT,
    "mood" TEXT,
    "privacyLevel" TEXT NOT NULL DEFAULT 'private',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViontoAlbum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViontoAlbumItem" (
    "id" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViontoAlbumItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViontoUsageMetric" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "projectId" TEXT,
    "metric" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "ViontoUsageMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViontoPlanQuota" (
    "id" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "limitValue" INTEGER NOT NULL,
    "overagePrice" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',

    CONSTRAINT "ViontoPlanQuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GooglePhotosConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleAccountEmail" TEXT,
    "googleAccountSub" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastError" TEXT,
    "lastRefreshAt" TIMESTAMP(3),
    "lastImportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GooglePhotosConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ViontoProject_userId_idx" ON "ViontoProject"("userId");

-- CreateIndex
CREATE INDEX "ViontoProject_status_idx" ON "ViontoProject"("status");

-- CreateIndex
CREATE INDEX "ViontoProject_createdAt_idx" ON "ViontoProject"("createdAt");

-- CreateIndex
CREATE INDEX "ViontoProjectShare_projectId_idx" ON "ViontoProjectShare"("projectId");

-- CreateIndex
CREATE INDEX "ViontoProjectShare_sharedWithUserId_idx" ON "ViontoProjectShare"("sharedWithUserId");

-- CreateIndex
CREATE INDEX "ViontoProjectShare_email_idx" ON "ViontoProjectShare"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ViontoProjectShare_projectId_email_key" ON "ViontoProjectShare"("projectId", "email");

-- CreateIndex
CREATE INDEX "ViontoAsset_projectId_idx" ON "ViontoAsset"("projectId");

-- CreateIndex
CREATE INDEX "ViontoAsset_userId_idx" ON "ViontoAsset"("userId");

-- CreateIndex
CREATE INDEX "ViontoAsset_type_idx" ON "ViontoAsset"("type");

-- CreateIndex
CREATE INDEX "ViontoAsset_orderIndex_idx" ON "ViontoAsset"("orderIndex");

-- CreateIndex
CREATE INDEX "ViontoScript_projectId_idx" ON "ViontoScript"("projectId");

-- CreateIndex
CREATE INDEX "ViontoScript_versionId_idx" ON "ViontoScript"("versionId");

-- CreateIndex
CREATE INDEX "ViontoScript_userId_idx" ON "ViontoScript"("userId");

-- CreateIndex
CREATE INDEX "ViontoScript_isUserEdited_idx" ON "ViontoScript"("isUserEdited");

-- CreateIndex
CREATE INDEX "ViontoAudioTrack_projectId_idx" ON "ViontoAudioTrack"("projectId");

-- CreateIndex
CREATE INDEX "ViontoAudioTrack_versionId_idx" ON "ViontoAudioTrack"("versionId");

-- CreateIndex
CREATE INDEX "ViontoAudioTrack_userId_idx" ON "ViontoAudioTrack"("userId");

-- CreateIndex
CREATE INDEX "ViontoAudioTrack_type_idx" ON "ViontoAudioTrack"("type");

-- CreateIndex
CREATE INDEX "ViontoRenderJob_projectId_idx" ON "ViontoRenderJob"("projectId");

-- CreateIndex
CREATE INDEX "ViontoRenderJob_versionId_idx" ON "ViontoRenderJob"("versionId");

-- CreateIndex
CREATE INDEX "ViontoRenderJob_userId_idx" ON "ViontoRenderJob"("userId");

-- CreateIndex
CREATE INDEX "ViontoRenderJob_state_idx" ON "ViontoRenderJob"("state");

-- CreateIndex
CREATE INDEX "ViontoRenderJob_queueId_idx" ON "ViontoRenderJob"("queueId");

-- CreateIndex
CREATE INDEX "ViontoRenderJob_createdAt_idx" ON "ViontoRenderJob"("createdAt");

-- CreateIndex
CREATE INDEX "ViontoExport_projectId_idx" ON "ViontoExport"("projectId");

-- CreateIndex
CREATE INDEX "ViontoExport_versionId_idx" ON "ViontoExport"("versionId");

-- CreateIndex
CREATE INDEX "ViontoExport_renderJobId_idx" ON "ViontoExport"("renderJobId");

-- CreateIndex
CREATE INDEX "ViontoExport_userId_idx" ON "ViontoExport"("userId");

-- CreateIndex
CREATE INDEX "ViontoExport_userId_createdAt_idx" ON "ViontoExport"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ViontoExport_userId_userMode_createdAt_idx" ON "ViontoExport"("userId", "userMode", "createdAt");

-- CreateIndex
CREATE INDEX "ViontoExport_userId_aspectRatio_createdAt_idx" ON "ViontoExport"("userId", "aspectRatio", "createdAt");

-- CreateIndex
CREATE INDEX "ViontoExport_format_idx" ON "ViontoExport"("format");

-- CreateIndex
CREATE INDEX "ViontoAuditEvent_actorId_idx" ON "ViontoAuditEvent"("actorId");

-- CreateIndex
CREATE INDEX "ViontoAuditEvent_entity_idx" ON "ViontoAuditEvent"("entity");

-- CreateIndex
CREATE INDEX "ViontoAuditEvent_entityId_idx" ON "ViontoAuditEvent"("entityId");

-- CreateIndex
CREATE INDEX "ViontoAuditEvent_action_idx" ON "ViontoAuditEvent"("action");

-- CreateIndex
CREATE INDEX "ViontoAuditEvent_createdAt_idx" ON "ViontoAuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ViontoVideoVersion_projectId_idx" ON "ViontoVideoVersion"("projectId");

-- CreateIndex
CREATE INDEX "ViontoVideoVersion_userId_idx" ON "ViontoVideoVersion"("userId");

-- CreateIndex
CREATE INDEX "ViontoVideoVersion_albumId_idx" ON "ViontoVideoVersion"("albumId");

-- CreateIndex
CREATE INDEX "ViontoVideoVersion_templateId_idx" ON "ViontoVideoVersion"("templateId");

-- CreateIndex
CREATE INDEX "ViontoAlbum_projectId_idx" ON "ViontoAlbum"("projectId");

-- CreateIndex
CREATE INDEX "ViontoAlbum_userId_idx" ON "ViontoAlbum"("userId");

-- CreateIndex
CREATE INDEX "ViontoAlbum_projectId_isBase_idx" ON "ViontoAlbum"("projectId", "isBase");

-- CreateIndex
CREATE INDEX "ViontoAlbum_lifecycleStage_idx" ON "ViontoAlbum"("lifecycleStage");

-- CreateIndex
CREATE INDEX "ViontoAlbum_isFavorite_idx" ON "ViontoAlbum"("isFavorite");

-- CreateIndex
CREATE INDEX "ViontoAlbumItem_albumId_orderIndex_idx" ON "ViontoAlbumItem"("albumId", "orderIndex");

-- CreateIndex
CREATE INDEX "ViontoAlbumItem_assetId_idx" ON "ViontoAlbumItem"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "ViontoAlbumItem_albumId_assetId_key" ON "ViontoAlbumItem"("albumId", "assetId");

-- CreateIndex
CREATE INDEX "ViontoUsageMetric_tenantId_idx" ON "ViontoUsageMetric"("tenantId");

-- CreateIndex
CREATE INDEX "ViontoUsageMetric_userId_idx" ON "ViontoUsageMetric"("userId");

-- CreateIndex
CREATE INDEX "ViontoUsageMetric_projectId_idx" ON "ViontoUsageMetric"("projectId");

-- CreateIndex
CREATE INDEX "ViontoUsageMetric_metric_idx" ON "ViontoUsageMetric"("metric");

-- CreateIndex
CREATE INDEX "ViontoUsageMetric_periodStart_idx" ON "ViontoUsageMetric"("periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "ViontoUsageMetric_tenantId_metric_periodStart_key" ON "ViontoUsageMetric"("tenantId", "metric", "periodStart");

-- CreateIndex
CREATE INDEX "ViontoPlanQuota_planCode_idx" ON "ViontoPlanQuota"("planCode");

-- CreateIndex
CREATE INDEX "ViontoPlanQuota_metric_idx" ON "ViontoPlanQuota"("metric");

-- CreateIndex
CREATE UNIQUE INDEX "ViontoPlanQuota_planCode_metric_key" ON "ViontoPlanQuota"("planCode", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "GooglePhotosConnection_userId_key" ON "GooglePhotosConnection"("userId");

-- CreateIndex
CREATE INDEX "GooglePhotosConnection_userId_idx" ON "GooglePhotosConnection"("userId");

-- CreateIndex
CREATE INDEX "GooglePhotosConnection_status_idx" ON "GooglePhotosConnection"("status");

-- AddForeignKey
ALTER TABLE "ViontoProject" ADD CONSTRAINT "ViontoProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViontoProjectShare" ADD CONSTRAINT "ViontoProjectShare_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ViontoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViontoProjectShare" ADD CONSTRAINT "ViontoProjectShare_sharedByUserId_fkey" FOREIGN KEY ("sharedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViontoProjectShare" ADD CONSTRAINT "ViontoProjectShare_sharedWithUserId_fkey" FOREIGN KEY ("sharedWithUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViontoAsset" ADD CONSTRAINT "ViontoAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ViontoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViontoScript" ADD CONSTRAINT "ViontoScript_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ViontoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViontoScript" ADD CONSTRAINT "ViontoScript_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ViontoVideoVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViontoAudioTrack" ADD CONSTRAINT "ViontoAudioTrack_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ViontoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViontoAudioTrack" ADD CONSTRAINT "ViontoAudioTrack_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ViontoVideoVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViontoRenderJob" ADD CONSTRAINT "ViontoRenderJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ViontoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViontoRenderJob" ADD CONSTRAINT "ViontoRenderJob_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ViontoVideoVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViontoExport" ADD CONSTRAINT "ViontoExport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ViontoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViontoExport" ADD CONSTRAINT "ViontoExport_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ViontoVideoVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViontoExport" ADD CONSTRAINT "ViontoExport_renderJobId_fkey" FOREIGN KEY ("renderJobId") REFERENCES "ViontoRenderJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViontoAuditEvent" ADD CONSTRAINT "ViontoAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViontoVideoVersion" ADD CONSTRAINT "ViontoVideoVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ViontoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViontoVideoVersion" ADD CONSTRAINT "ViontoVideoVersion_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "ViontoAlbum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViontoAlbum" ADD CONSTRAINT "ViontoAlbum_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ViontoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViontoAlbumItem" ADD CONSTRAINT "ViontoAlbumItem_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "ViontoAlbum"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViontoAlbumItem" ADD CONSTRAINT "ViontoAlbumItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "ViontoAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViontoUsageMetric" ADD CONSTRAINT "ViontoUsageMetric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViontoUsageMetric" ADD CONSTRAINT "ViontoUsageMetric_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ViontoProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GooglePhotosConnection" ADD CONSTRAINT "GooglePhotosConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
