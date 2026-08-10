-- AlterTable
ALTER TABLE "EduStudentProfile" ADD COLUMN     "guardianEmail" TEXT,
ADD COLUMN     "guardianName" TEXT,
ADD COLUMN     "isMinor" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "preferredLanguage" TEXT;

-- AlterTable
ALTER TABLE "EduTutorProfile" ADD COLUMN     "clearedForMinorsAt" TIMESTAMP(3),
ADD COLUMN     "invitesReceived" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "languagesTaught" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "lastMatchedAt" TIMESTAMP(3),
ADD COLUMN     "medianResponseMinutes" INTEGER,
ADD COLUMN     "proposalsSent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "qualifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "teachingStyle" TEXT,
ADD COLUMN     "weeklyAvailability" JSONB;

-- AlterTable
ALTER TABLE "EduQuoteRequest" ADD COLUMN     "briefId" TEXT;

-- AlterTable
ALTER TABLE "EduQuote" ADD COLUMN     "aiDrafted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "briefId" TEXT,
ADD COLUMN     "cancellationPolicy" TEXT,
ADD COLUMN     "declineReason" TEXT,
ADD COLUMN     "earliestStartAt" TIMESTAMP(3),
ADD COLUMN     "language" TEXT,
ADD COLUMN     "mode" TEXT,
ADD COLUMN     "planOutline" JSONB,
ADD COLUMN     "preparationNotes" TEXT,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "sessionCount" INTEGER,
ADD COLUMN     "sessionMinutes" INTEGER,
ADD COLUMN     "tutorAdjusted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "EduLearningBrief" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "inquiryId" TEXT,
    "subject" TEXT NOT NULL,
    "topic" TEXT,
    "educationalLevel" TEXT NOT NULL,
    "schoolYear" TEXT,
    "learningObjective" TEXT,
    "currentUnderstanding" TEXT,
    "difficulties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "prerequisiteGaps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "language" TEXT NOT NULL DEFAULT 'en',
    "mode" TEXT NOT NULL DEFAULT 'EITHER',
    "locationCity" TEXT,
    "locationLat" DOUBLE PRECISION,
    "locationLng" DOUBLE PRECISION,
    "availability" JSONB,
    "deadlineAt" TIMESTAMP(3),
    "deadlineKind" TEXT,
    "accessibilityNeeds" TEXT,
    "estimatedSessions" INTEGER,
    "sessionMinutes" INTEGER,
    "triageOutcome" TEXT,
    "triageRationale" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "diagnosticResult" JSONB,
    "attachments" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EduLearningBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EduIntakeTurn" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "field" TEXT,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EduIntakeTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EduMatchCandidate" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "quoteRequestId" TEXT,
    "tutorId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "breakdown" JSONB NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rotationBoost" BOOLEAN NOT NULL DEFAULT false,
    "invitedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EduMatchCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EduSessionRecord" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "briefId" TEXT,
    "tutorId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "attendance" TEXT NOT NULL DEFAULT 'ATTENDED',
    "topicsCovered" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tutorNotes" TEXT,
    "studentSummary" TEXT,
    "homework" TEXT,
    "nextStep" TEXT,
    "resources" JSONB,
    "goalProgress" INTEGER,
    "openConcerns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EduSessionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EduReview" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EduReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EduLearningBrief_inquiryId_key" ON "EduLearningBrief"("inquiryId");

-- CreateIndex
CREATE INDEX "EduLearningBrief_studentId_idx" ON "EduLearningBrief"("studentId");

-- CreateIndex
CREATE INDEX "EduLearningBrief_status_idx" ON "EduLearningBrief"("status");

-- CreateIndex
CREATE INDEX "EduLearningBrief_subject_idx" ON "EduLearningBrief"("subject");

-- CreateIndex
CREATE INDEX "EduLearningBrief_triageOutcome_idx" ON "EduLearningBrief"("triageOutcome");

-- CreateIndex
CREATE INDEX "EduLearningBrief_createdAt_idx" ON "EduLearningBrief"("createdAt");

-- CreateIndex
CREATE INDEX "EduIntakeTurn_briefId_idx" ON "EduIntakeTurn"("briefId");

-- CreateIndex
CREATE INDEX "EduIntakeTurn_createdAt_idx" ON "EduIntakeTurn"("createdAt");

-- CreateIndex
CREATE INDEX "EduMatchCandidate_briefId_idx" ON "EduMatchCandidate"("briefId");

-- CreateIndex
CREATE INDEX "EduMatchCandidate_quoteRequestId_idx" ON "EduMatchCandidate"("quoteRequestId");

-- CreateIndex
CREATE INDEX "EduMatchCandidate_tutorId_idx" ON "EduMatchCandidate"("tutorId");

-- CreateIndex
CREATE UNIQUE INDEX "EduMatchCandidate_briefId_tutorId_key" ON "EduMatchCandidate"("briefId", "tutorId");

-- CreateIndex
CREATE UNIQUE INDEX "EduSessionRecord_bookingId_key" ON "EduSessionRecord"("bookingId");

-- CreateIndex
CREATE INDEX "EduSessionRecord_briefId_idx" ON "EduSessionRecord"("briefId");

-- CreateIndex
CREATE INDEX "EduSessionRecord_studentId_idx" ON "EduSessionRecord"("studentId");

-- CreateIndex
CREATE INDEX "EduSessionRecord_tutorId_idx" ON "EduSessionRecord"("tutorId");

-- CreateIndex
CREATE INDEX "EduSessionRecord_createdAt_idx" ON "EduSessionRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EduReview_bookingId_key" ON "EduReview"("bookingId");

-- CreateIndex
CREATE INDEX "EduReview_tutorId_idx" ON "EduReview"("tutorId");

-- CreateIndex
CREATE INDEX "EduReview_studentId_idx" ON "EduReview"("studentId");

-- CreateIndex
CREATE INDEX "EduReview_createdAt_idx" ON "EduReview"("createdAt");

-- CreateIndex
CREATE INDEX "EduStudentProfile_isMinor_idx" ON "EduStudentProfile"("isMinor");

-- CreateIndex
CREATE INDEX "EduTutorProfile_clearedForMinorsAt_idx" ON "EduTutorProfile"("clearedForMinorsAt");

-- CreateIndex
CREATE INDEX "EduTutorProfile_lastMatchedAt_idx" ON "EduTutorProfile"("lastMatchedAt");

-- CreateIndex
CREATE INDEX "EduQuoteRequest_briefId_idx" ON "EduQuoteRequest"("briefId");

-- CreateIndex
CREATE INDEX "EduQuote_briefId_idx" ON "EduQuote"("briefId");

-- AddForeignKey
ALTER TABLE "EduQuoteRequest" ADD CONSTRAINT "EduQuoteRequest_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "EduLearningBrief"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduQuote" ADD CONSTRAINT "EduQuote_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "EduLearningBrief"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduLearningBrief" ADD CONSTRAINT "EduLearningBrief_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduLearningBrief" ADD CONSTRAINT "EduLearningBrief_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "EduInquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduIntakeTurn" ADD CONSTRAINT "EduIntakeTurn_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "EduLearningBrief"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduMatchCandidate" ADD CONSTRAINT "EduMatchCandidate_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "EduLearningBrief"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduMatchCandidate" ADD CONSTRAINT "EduMatchCandidate_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "EduQuoteRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduMatchCandidate" ADD CONSTRAINT "EduMatchCandidate_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduSessionRecord" ADD CONSTRAINT "EduSessionRecord_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "EduBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduSessionRecord" ADD CONSTRAINT "EduSessionRecord_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "EduLearningBrief"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduSessionRecord" ADD CONSTRAINT "EduSessionRecord_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduSessionRecord" ADD CONSTRAINT "EduSessionRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduReview" ADD CONSTRAINT "EduReview_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "EduBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduReview" ADD CONSTRAINT "EduReview_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduReview" ADD CONSTRAINT "EduReview_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
