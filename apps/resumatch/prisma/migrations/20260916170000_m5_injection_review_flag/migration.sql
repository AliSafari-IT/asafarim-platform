-- JM-044: ingestion-time heuristic scan for instruction-like / prompt-injection-shaped
-- posting text. A flag + matched-pattern-codes annotation for operator review only --
-- never consulted by the M5 evaluation pipeline (see lib/matching/ai/evaluate.ts).
-- AlterTable
ALTER TABLE "job_postings" ADD COLUMN     "flaggedForInjectionReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "injectionPatternCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "job_postings_flaggedForInjectionReview_idx" ON "job_postings"("flaggedForInjectionReview");
