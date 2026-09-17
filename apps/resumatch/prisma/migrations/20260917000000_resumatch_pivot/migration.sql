-- ResuMatch pivot: drop the job-ingestion/matching subsystem inherited from
-- JobMatch, and add the two models the CV-tailoring product needs instead.

-- DropForeignKey
ALTER TABLE "job_snapshots" DROP CONSTRAINT IF EXISTS "job_snapshots_sourceId_fkey";
ALTER TABLE "job_postings" DROP CONSTRAINT IF EXISTS "job_postings_sourceId_fkey";
ALTER TABLE "job_postings" DROP CONSTRAINT IF EXISTS "job_postings_snapshotId_fkey";
ALTER TABLE "job_postings" DROP CONSTRAINT IF EXISTS "job_postings_duplicateOfId_fkey";
ALTER TABLE "ingestion_runs" DROP CONSTRAINT IF EXISTS "ingestion_runs_sourceId_fkey";
ALTER TABLE "tracked_jobs" DROP CONSTRAINT IF EXISTS "tracked_jobs_workspaceId_fkey";
ALTER TABLE "tracked_jobs" DROP CONSTRAINT IF EXISTS "tracked_jobs_jobPostingId_fkey";
ALTER TABLE "job_feedback" DROP CONSTRAINT IF EXISTS "job_feedback_workspaceId_fkey";
ALTER TABLE "job_feedback" DROP CONSTRAINT IF EXISTS "job_feedback_jobPostingId_fkey";
ALTER TABLE "match_run" DROP CONSTRAINT IF EXISTS "match_run_workspaceId_fkey";

-- DropTable
DROP TABLE IF EXISTS "job_feedback";
DROP TABLE IF EXISTS "tracked_jobs";
DROP TABLE IF EXISTS "match_run";
DROP TABLE IF EXISTS "match_embeddings";
DROP TABLE IF EXISTS "ingestion_runs";
DROP TABLE IF EXISTS "job_postings";
DROP TABLE IF EXISTS "job_snapshots";
DROP TABLE IF EXISTS "job_sources";

-- DropEnum
DROP TYPE IF EXISTS "FeedbackReasonCode";
DROP TYPE IF EXISTS "TrackedJobStatus";
DROP TYPE IF EXISTS "RunOutcome";
DROP TYPE IF EXISTS "PostingStatus";
DROP TYPE IF EXISTS "SourceStatus";
DROP TYPE IF EXISTS "SourceKind";
DROP TYPE IF EXISTS "EmbeddingKind";

-- CreateEnum
CREATE TYPE "TargetJobStatus" AS ENUM ('FETCHED', 'FETCH_FAILED');

-- CreateTable
CREATE TABLE "target_jobs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "rawText" TEXT,
    "title" TEXT,
    "employer" TEXT,
    "status" "TargetJobStatus" NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "target_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tailored_resumes" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "profileVersionId" TEXT NOT NULL,
    "targetJobId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "templateKey" TEXT NOT NULL,
    "aiJobId" TEXT,
    "promptVersion" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "degraded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tailored_resumes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "target_jobs_workspaceId_createdAt_idx" ON "target_jobs"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "tailored_resumes_workspaceId_createdAt_idx" ON "tailored_resumes"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "tailored_resumes_targetJobId_idx" ON "tailored_resumes"("targetJobId");

-- AddForeignKey
ALTER TABLE "target_jobs" ADD CONSTRAINT "target_jobs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tailored_resumes" ADD CONSTRAINT "tailored_resumes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tailored_resumes" ADD CONSTRAINT "tailored_resumes_profileVersionId_fkey" FOREIGN KEY ("profileVersionId") REFERENCES "candidate_profile_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tailored_resumes" ADD CONSTRAINT "tailored_resumes_targetJobId_fkey" FOREIGN KEY ("targetJobId") REFERENCES "target_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
