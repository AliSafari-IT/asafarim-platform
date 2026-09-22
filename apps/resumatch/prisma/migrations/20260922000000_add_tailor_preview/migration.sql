-- CreateTable
CREATE TABLE "tailor_previews" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "profileVersionId" TEXT NOT NULL,
    "targetJobId" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "degraded" BOOLEAN NOT NULL,
    "coverLetterPromptVersion" TEXT,
    "coverLetterModelVersion" TEXT,
    "coverLetterDegraded" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "tailor_previews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tailor_previews_workspaceId_createdAt_idx" ON "tailor_previews"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "tailor_previews" ADD CONSTRAINT "tailor_previews_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
