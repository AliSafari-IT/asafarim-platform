-- #932: original suggestions on the preview, and review feedback per saved CV.
-- AlterTable
ALTER TABLE "tailor_previews" ADD COLUMN "suggestions" JSONB,
ADD COLUMN "coverLetterSuggestion" JSONB;

-- CreateTable
CREATE TABLE "tailoring_feedback" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "tailoredResumeId" TEXT NOT NULL,
    "previewId" TEXT NOT NULL,
    "feedbackVersion" TEXT NOT NULL,
    "original" JSONB NOT NULL,
    "decisions" JSONB NOT NULL,
    "promotions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tailoring_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tailoring_feedback_tailoredResumeId_key" ON "tailoring_feedback"("tailoredResumeId");

-- CreateIndex
CREATE UNIQUE INDEX "tailoring_feedback_previewId_key" ON "tailoring_feedback"("previewId");

-- CreateIndex
CREATE INDEX "tailoring_feedback_workspaceId_createdAt_idx" ON "tailoring_feedback"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "tailoring_feedback" ADD CONSTRAINT "tailoring_feedback_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tailoring_feedback" ADD CONSTRAINT "tailoring_feedback_tailoredResumeId_fkey" FOREIGN KEY ("tailoredResumeId") REFERENCES "tailored_resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
