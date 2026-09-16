-- JM-048: evidence-linked explanation UI — "Report incorrect evidence" feeds
-- the existing M7 feedback pipeline with a new reason code plus enough
-- context to trace a report back to the specific MatchEvidence row it
-- disputes.
--
-- Hand-written rather than `prisma migrate dev`-generated: no live Postgres
-- was reachable in the sandbox this was authored in (Docker Desktop was not
-- running). Written to match Prisma's own generated SQL shape and naming
-- convention exactly, following 20260916170000_m5_injection_review_flag's
-- precedent, so `prisma migrate deploy` applies it identically to one
-- Prisma would have produced itself.

-- AlterEnum
ALTER TYPE "FeedbackReasonCode" ADD VALUE 'INCORRECT_MATCH_EVIDENCE';

-- AlterTable
ALTER TABLE "job_feedback" ADD COLUMN     "relatedProfileVersionId" TEXT,
ADD COLUMN     "relatedProfileField" TEXT,
ADD COLUMN     "relatedPostingRequirement" TEXT;
