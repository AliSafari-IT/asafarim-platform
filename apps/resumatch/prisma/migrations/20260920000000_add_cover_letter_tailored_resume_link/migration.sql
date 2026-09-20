-- AlterTable
ALTER TABLE "cover_letters" ADD COLUMN     "tailoredResumeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "cover_letters_tailoredResumeId_key" ON "cover_letters"("tailoredResumeId");

-- AddForeignKey
ALTER TABLE "cover_letters" ADD CONSTRAINT "cover_letters_tailoredResumeId_fkey" FOREIGN KEY ("tailoredResumeId") REFERENCES "tailored_resumes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
