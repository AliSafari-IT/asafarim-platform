-- CreateEnum
CREATE TYPE "FeedbackReasonCode" AS ENUM ('PROFILE_SKILL_MISSING', 'PROFILE_DATA_INCORRECT', 'SOURCE_POSTING_STALE', 'SOURCE_DETAILS_INCORRECT', 'RULE_WRONGLY_EXCLUDED', 'RULE_WRONGLY_INCLUDED', 'NOT_RELEVANT', 'OTHER');

-- CreateTable
CREATE TABLE "job_feedback" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "jobPostingId" TEXT NOT NULL,
    "reasonCode" "FeedbackReasonCode" NOT NULL,
    "note" TEXT,
    "relatedEligibilityReasonCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_feedback_workspaceId_createdAt_idx" ON "job_feedback"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "job_feedback_jobPostingId_reasonCode_idx" ON "job_feedback"("jobPostingId", "reasonCode");

-- AddForeignKey
ALTER TABLE "job_feedback" ADD CONSTRAINT "job_feedback_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Restrict, not Cascade: feedback is append-only history and JobPosting has
-- no deletion path today. A future one must decide what happens to this
-- history explicitly rather than losing it to a cascade.
ALTER TABLE "job_feedback" ADD CONSTRAINT "job_feedback_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "job_postings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
