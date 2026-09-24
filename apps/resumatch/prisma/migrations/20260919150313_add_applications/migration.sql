-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('SAVED', 'APPLIED', 'INTERVIEWING', 'OFFER', 'REJECTED');

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "targetJobId" TEXT NOT NULL,
    "tailoredResumeId" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SAVED',
    "notes" TEXT,
    "followUpDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "applications_workspaceId_createdAt_idx" ON "applications"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "applications_workspaceId_status_idx" ON "applications"("workspaceId", "status");

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_targetJobId_fkey" FOREIGN KEY ("targetJobId") REFERENCES "target_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_tailoredResumeId_fkey" FOREIGN KEY ("tailoredResumeId") REFERENCES "tailored_resumes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
