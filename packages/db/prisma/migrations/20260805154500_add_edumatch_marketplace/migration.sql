-- EduMatch marketplace domain migrated from asafarim-digital.

-- Additive: creates only Edu* tables, indexes, and relations.



-- CreateTable
CREATE TABLE "EduStudentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gradeLevel" TEXT NOT NULL,
    "subjectsOfInterest" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "homeAddress" JSONB,
    "homeLat" DOUBLE PRECISION,
    "homeLng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EduStudentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EduTutorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bio" TEXT,
    "subjectsTaught" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "levelsTaught" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hourlyRateCents" INTEGER NOT NULL DEFAULT 0,
    "onlineOnly" BOOLEAN NOT NULL DEFAULT false,
    "serviceRadiusKm" INTEGER NOT NULL DEFAULT 10,
    "homeAddress" JSONB,
    "homeLat" DOUBLE PRECISION,
    "homeLng" DOUBLE PRECISION,
    "stripeAccountId" TEXT,
    "payoutEnabled" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EduTutorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EduInquiry" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "gradeLevel" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "attachments" JSONB,
    "aiSummary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EduInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EduAiResponse" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "studyPlan" JSONB,
    "practiceProblems" JSONB,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "tokenCostMicros" INTEGER,
    "latencyMs" INTEGER,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "stopReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EduAiResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EduQuoteRequest" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "EduQuoteRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EduQuote" (
    "id" TEXT NOT NULL,
    "quoteRequestId" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "hourlyRateCents" INTEGER NOT NULL,
    "estimatedHours" DOUBLE PRECISION NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "availabilitySlots" JSONB,
    "notes" TEXT,
    "pdfUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EduQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EduBooking" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "meetingUrl" TEXT,
    "stripePaymentIntentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EduBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EduTransaction" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "grossCents" INTEGER NOT NULL,
    "platformFeeCents" INTEGER NOT NULL DEFAULT 0,
    "netCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "stripeChargeId" TEXT,
    "stripePayoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EduTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EduWallet" (
    "tutorId" TEXT NOT NULL,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "pendingCents" INTEGER NOT NULL DEFAULT 0,
    "payoutThresholdCents" INTEGER NOT NULL DEFAULT 5000,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "lastPayoutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EduWallet_pkey" PRIMARY KEY ("tutorId")
);

-- CreateTable
CREATE TABLE "EduNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EduNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EduMessage" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EduMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EduStudentProfile_userId_key" ON "EduStudentProfile"("userId");

-- CreateIndex
CREATE INDEX "EduStudentProfile_gradeLevel_idx" ON "EduStudentProfile"("gradeLevel");

-- CreateIndex
CREATE UNIQUE INDEX "EduTutorProfile_userId_key" ON "EduTutorProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EduTutorProfile_stripeAccountId_key" ON "EduTutorProfile"("stripeAccountId");

-- CreateIndex
CREATE INDEX "EduTutorProfile_onlineOnly_idx" ON "EduTutorProfile"("onlineOnly");

-- CreateIndex
CREATE INDEX "EduTutorProfile_hourlyRateCents_idx" ON "EduTutorProfile"("hourlyRateCents");

-- CreateIndex
CREATE INDEX "EduTutorProfile_ratingAvg_idx" ON "EduTutorProfile"("ratingAvg");

-- CreateIndex
CREATE INDEX "EduTutorProfile_verifiedAt_idx" ON "EduTutorProfile"("verifiedAt");

-- CreateIndex
CREATE INDEX "EduInquiry_studentId_idx" ON "EduInquiry"("studentId");

-- CreateIndex
CREATE INDEX "EduInquiry_status_idx" ON "EduInquiry"("status");

-- CreateIndex
CREATE INDEX "EduInquiry_subject_idx" ON "EduInquiry"("subject");

-- CreateIndex
CREATE INDEX "EduInquiry_createdAt_idx" ON "EduInquiry"("createdAt");

-- CreateIndex
CREATE INDEX "EduAiResponse_inquiryId_idx" ON "EduAiResponse"("inquiryId");

-- CreateIndex
CREATE INDEX "EduAiResponse_createdAt_idx" ON "EduAiResponse"("createdAt");

-- CreateIndex
CREATE INDEX "EduQuoteRequest_inquiryId_idx" ON "EduQuoteRequest"("inquiryId");

-- CreateIndex
CREATE INDEX "EduQuoteRequest_studentId_idx" ON "EduQuoteRequest"("studentId");

-- CreateIndex
CREATE INDEX "EduQuoteRequest_status_idx" ON "EduQuoteRequest"("status");

-- CreateIndex
CREATE INDEX "EduQuoteRequest_expiresAt_idx" ON "EduQuoteRequest"("expiresAt");

-- CreateIndex
CREATE INDEX "EduQuote_quoteRequestId_idx" ON "EduQuote"("quoteRequestId");

-- CreateIndex
CREATE INDEX "EduQuote_tutorId_idx" ON "EduQuote"("tutorId");

-- CreateIndex
CREATE INDEX "EduQuote_status_idx" ON "EduQuote"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EduQuote_quoteRequestId_tutorId_key" ON "EduQuote"("quoteRequestId", "tutorId");

-- CreateIndex
CREATE UNIQUE INDEX "EduBooking_quoteId_key" ON "EduBooking"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "EduBooking_stripePaymentIntentId_key" ON "EduBooking"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "EduBooking_studentId_idx" ON "EduBooking"("studentId");

-- CreateIndex
CREATE INDEX "EduBooking_tutorId_idx" ON "EduBooking"("tutorId");

-- CreateIndex
CREATE INDEX "EduBooking_status_idx" ON "EduBooking"("status");

-- CreateIndex
CREATE INDEX "EduBooking_scheduledAt_idx" ON "EduBooking"("scheduledAt");

-- CreateIndex
CREATE INDEX "EduTransaction_bookingId_idx" ON "EduTransaction"("bookingId");

-- CreateIndex
CREATE INDEX "EduTransaction_tutorId_idx" ON "EduTransaction"("tutorId");

-- CreateIndex
CREATE INDEX "EduTransaction_type_idx" ON "EduTransaction"("type");

-- CreateIndex
CREATE INDEX "EduTransaction_createdAt_idx" ON "EduTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "EduTransaction_stripeChargeId_idx" ON "EduTransaction"("stripeChargeId");

-- CreateIndex
CREATE INDEX "EduNotification_userId_idx" ON "EduNotification"("userId");

-- CreateIndex
CREATE INDEX "EduNotification_type_idx" ON "EduNotification"("type");

-- CreateIndex
CREATE INDEX "EduNotification_readAt_idx" ON "EduNotification"("readAt");

-- CreateIndex
CREATE INDEX "EduNotification_createdAt_idx" ON "EduNotification"("createdAt");

-- CreateIndex
CREATE INDEX "EduMessage_bookingId_idx" ON "EduMessage"("bookingId");

-- CreateIndex
CREATE INDEX "EduMessage_senderId_idx" ON "EduMessage"("senderId");

-- CreateIndex
CREATE INDEX "EduMessage_createdAt_idx" ON "EduMessage"("createdAt");

-- AddForeignKey
ALTER TABLE "EduStudentProfile" ADD CONSTRAINT "EduStudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduTutorProfile" ADD CONSTRAINT "EduTutorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduInquiry" ADD CONSTRAINT "EduInquiry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduAiResponse" ADD CONSTRAINT "EduAiResponse_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "EduInquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduQuoteRequest" ADD CONSTRAINT "EduQuoteRequest_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "EduInquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduQuote" ADD CONSTRAINT "EduQuote_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "EduQuoteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduQuote" ADD CONSTRAINT "EduQuote_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduBooking" ADD CONSTRAINT "EduBooking_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "EduQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduBooking" ADD CONSTRAINT "EduBooking_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduBooking" ADD CONSTRAINT "EduBooking_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduTransaction" ADD CONSTRAINT "EduTransaction_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "EduBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduTransaction" ADD CONSTRAINT "EduTransaction_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduWallet" ADD CONSTRAINT "EduWallet_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduNotification" ADD CONSTRAINT "EduNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduMessage" ADD CONSTRAINT "EduMessage_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "EduBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduMessage" ADD CONSTRAINT "EduMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- EduMatch trust, safety, and quality hardening (issue #014)
--
-- Adds:
--   * Moderation columns on EduInquiry and EduAiResponse
--   * EduTutorVerification (admin-managed verification workflow)
--   * EduNotificationPreference (per-user notification opt-in/out)
--   * EduAuditEvent (EduMatch-specific audit trail)
--
-- All changes are additive: existing fields/values remain untouched.

-- ── EduInquiry ────────────────────────────────────────────────
ALTER TABLE "EduInquiry"
    ADD COLUMN IF NOT EXISTS "moderationOutcome"  TEXT,
    ADD COLUMN IF NOT EXISTS "moderationCategory" TEXT,
    ADD COLUMN IF NOT EXISTS "moderationReason"   TEXT;

CREATE INDEX IF NOT EXISTS "EduInquiry_moderationOutcome_idx"
    ON "EduInquiry" ("moderationOutcome");

-- ── EduAiResponse ─────────────────────────────────────────────
ALTER TABLE "EduAiResponse"
    ADD COLUMN IF NOT EXISTS "moderationOutcome"  TEXT,
    ADD COLUMN IF NOT EXISTS "moderationCategory" TEXT,
    ADD COLUMN IF NOT EXISTS "moderationReason"   TEXT;

CREATE INDEX IF NOT EXISTS "EduAiResponse_moderationOutcome_idx"
    ON "EduAiResponse" ("moderationOutcome");

-- ── EduTutorVerification ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "EduTutorVerification" (
    "id"           TEXT NOT NULL,
    "tutorId"      TEXT NOT NULL,
    "reviewerId"   TEXT,
    "status"       TEXT NOT NULL DEFAULT 'PENDING',
    "checklist"    JSONB,
    "adminNotes"   TEXT,
    "tutorMessage" TEXT,
    "resolvedAt"   TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EduTutorVerification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EduTutorVerification_tutorId_idx"    ON "EduTutorVerification" ("tutorId");
CREATE INDEX IF NOT EXISTS "EduTutorVerification_status_idx"     ON "EduTutorVerification" ("status");
CREATE INDEX IF NOT EXISTS "EduTutorVerification_reviewerId_idx" ON "EduTutorVerification" ("reviewerId");
CREATE INDEX IF NOT EXISTS "EduTutorVerification_createdAt_idx"  ON "EduTutorVerification" ("createdAt");

ALTER TABLE "EduTutorVerification"
    ADD CONSTRAINT "EduTutorVerification_tutorId_fkey"
    FOREIGN KEY ("tutorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EduTutorVerification"
    ADD CONSTRAINT "EduTutorVerification_reviewerId_fkey"
    FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── EduNotificationPreference ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "EduNotificationPreference" (
    "userId"                    TEXT NOT NULL,
    "inAppInquiryReceived"      BOOLEAN NOT NULL DEFAULT true,
    "inAppAiResponseReady"      BOOLEAN NOT NULL DEFAULT true,
    "inAppQuoteReceived"        BOOLEAN NOT NULL DEFAULT true,
    "inAppBookingConfirmed"     BOOLEAN NOT NULL DEFAULT true,
    "inAppCancellationUpdate"   BOOLEAN NOT NULL DEFAULT true,
    "inAppDisputeUpdate"        BOOLEAN NOT NULL DEFAULT true,
    "inAppPayoutSent"           BOOLEAN NOT NULL DEFAULT true,
    "emailInquiryReceived"      BOOLEAN NOT NULL DEFAULT true,
    "emailAiResponseReady"      BOOLEAN NOT NULL DEFAULT false,
    "emailQuoteReceived"        BOOLEAN NOT NULL DEFAULT true,
    "emailBookingConfirmed"     BOOLEAN NOT NULL DEFAULT true,
    "emailCancellationUpdate"   BOOLEAN NOT NULL DEFAULT true,
    "emailDisputeUpdate"        BOOLEAN NOT NULL DEFAULT true,
    "emailPayoutSent"           BOOLEAN NOT NULL DEFAULT true,
    "createdAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                 TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EduNotificationPreference_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "EduNotificationPreference"
    ADD CONSTRAINT "EduNotificationPreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── EduAuditEvent ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "EduAuditEvent" (
    "id"        TEXT NOT NULL,
    "actorId"   TEXT,
    "actorRole" TEXT,
    "action"    TEXT NOT NULL,
    "entity"    TEXT NOT NULL,
    "entityId"  TEXT,
    "prevState" TEXT,
    "nextState" TEXT,
    "reason"    TEXT,
    "metadata"  JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EduAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EduAuditEvent_actorId_idx"   ON "EduAuditEvent" ("actorId");
CREATE INDEX IF NOT EXISTS "EduAuditEvent_entity_idx"    ON "EduAuditEvent" ("entity");
CREATE INDEX IF NOT EXISTS "EduAuditEvent_entityId_idx"  ON "EduAuditEvent" ("entityId");
CREATE INDEX IF NOT EXISTS "EduAuditEvent_action_idx"    ON "EduAuditEvent" ("action");
CREATE INDEX IF NOT EXISTS "EduAuditEvent_createdAt_idx" ON "EduAuditEvent" ("createdAt");

ALTER TABLE "EduAuditEvent"
    ADD CONSTRAINT "EduAuditEvent_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- CreateTable
CREATE TABLE "EduVerificationMessage" (
    "id" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EduVerificationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EduVerificationMessage_tutorId_idx" ON "EduVerificationMessage"("tutorId");

-- CreateIndex
CREATE INDEX "EduVerificationMessage_senderId_idx" ON "EduVerificationMessage"("senderId");

-- CreateIndex
CREATE INDEX "EduVerificationMessage_createdAt_idx" ON "EduVerificationMessage"("createdAt");

-- AddForeignKey
ALTER TABLE "EduVerificationMessage" ADD CONSTRAINT "EduVerificationMessage_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EduVerificationMessage" ADD CONSTRAINT "EduVerificationMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- AlterTable
ALTER TABLE "EduVerificationMessage" ADD COLUMN "attachments" JSONB;



-- Add reactions JSONB column to EduVerificationMessage.
-- Stores { [emoji]: userId[] } where emoji is one of the supported set.
ALTER TABLE "EduVerificationMessage" ADD COLUMN "reactions" JSONB;
