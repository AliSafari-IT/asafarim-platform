-- AlterTable
ALTER TABLE "job_postings" ADD COLUMN     "languageRequired" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "requiredCertifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "requiresSponsorship" BOOLEAN,
ADD COLUMN     "seniorityLevel" TEXT;
