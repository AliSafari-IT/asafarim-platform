/*
  Warnings:

  - Added the required column `employerKey` to the `job_postings` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "job_postings" ADD COLUMN     "employerKey" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "job_postings_employerKey_idx" ON "job_postings"("employerKey");
