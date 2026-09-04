-- CreateEnum
CREATE TYPE "TrackedJobStatus" AS ENUM ('SAVED', 'REJECTED', 'APPLIED');

-- CreateTable
CREATE TABLE "tracked_jobs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "jobPostingId" TEXT NOT NULL,
    "status" "TrackedJobStatus" NOT NULL DEFAULT 'SAVED',
    "notes" TEXT,
    "appliedAt" TIMESTAMP(3),
    "interviewAt" TIMESTAMP(3),
    "followUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracked_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tracked_jobs_workspaceId_status_idx" ON "tracked_jobs"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tracked_jobs_workspaceId_jobPostingId_key" ON "tracked_jobs"("workspaceId", "jobPostingId");

-- AddForeignKey
ALTER TABLE "tracked_jobs" ADD CONSTRAINT "tracked_jobs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracked_jobs" ADD CONSTRAINT "tracked_jobs_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "job_postings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
