-- CreateTable
CREATE TABLE "cover_letters" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "profileVersionId" TEXT NOT NULL,
    "targetJobId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "degraded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cover_letters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cover_letters_workspaceId_createdAt_idx" ON "cover_letters"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "cover_letters_targetJobId_idx" ON "cover_letters"("targetJobId");

-- AddForeignKey
ALTER TABLE "cover_letters" ADD CONSTRAINT "cover_letters_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cover_letters" ADD CONSTRAINT "cover_letters_profileVersionId_fkey" FOREIGN KEY ("profileVersionId") REFERENCES "candidate_profile_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cover_letters" ADD CONSTRAINT "cover_letters_targetJobId_fkey" FOREIGN KEY ("targetJobId") REFERENCES "target_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
