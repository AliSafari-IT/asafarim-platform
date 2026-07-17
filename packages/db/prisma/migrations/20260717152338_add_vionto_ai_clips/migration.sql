-- CreateTable
CREATE TABLE "ViontoAiClip" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "versionId" TEXT,
    "albumId" TEXT,
    "albumItemId" TEXT,
    "assetId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'kling',
    "model" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'std',
    "prompt" TEXT NOT NULL,
    "negativePrompt" TEXT,
    "durationSeconds" INTEGER NOT NULL DEFAULT 5,
    "taskId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "outputStorageKey" TEXT,
    "outputDurationSeconds" DOUBLE PRECISION,
    "accepted" BOOLEAN NOT NULL DEFAULT true,
    "providerMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViontoAiClip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ViontoAiClip_projectId_idx" ON "ViontoAiClip"("projectId");

-- CreateIndex
CREATE INDEX "ViontoAiClip_assetId_idx" ON "ViontoAiClip"("assetId");

-- CreateIndex
CREATE INDEX "ViontoAiClip_userId_idx" ON "ViontoAiClip"("userId");

-- CreateIndex
CREATE INDEX "ViontoAiClip_status_idx" ON "ViontoAiClip"("status");

-- AddForeignKey
ALTER TABLE "ViontoAiClip" ADD CONSTRAINT "ViontoAiClip_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ViontoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
