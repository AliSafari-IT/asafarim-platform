-- Multi-aspect ratings: 3 sub-aspects per review, plus cached per-aspect
-- averages on EduTutorProfile for fast filtering. All new columns are
-- nullable / defaulted so existing rows (legacy reviews) keep working.

-- EduReview: sub-aspect ratings
ALTER TABLE "EduReview" ADD COLUMN "clarity" INTEGER;
ALTER TABLE "EduReview" ADD COLUMN "reliability" INTEGER;
ALTER TABLE "EduReview" ADD COLUMN "engagement" INTEGER;

-- EduTutorProfile: cached per-aspect averages + count of aspected reviews
ALTER TABLE "EduTutorProfile" ADD COLUMN "clarityAvg" DOUBLE PRECISION;
ALTER TABLE "EduTutorProfile" ADD COLUMN "reliabilityAvg" DOUBLE PRECISION;
ALTER TABLE "EduTutorProfile" ADD COLUMN "engagementAvg" DOUBLE PRECISION;
ALTER TABLE "EduTutorProfile" ADD COLUMN "aspectedCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "EduTutorProfile_clarityAvg_idx" ON "EduTutorProfile"("clarityAvg");
CREATE INDEX "EduTutorProfile_reliabilityAvg_idx" ON "EduTutorProfile"("reliabilityAvg");
CREATE INDEX "EduTutorProfile_engagementAvg_idx" ON "EduTutorProfile"("engagementAvg");
