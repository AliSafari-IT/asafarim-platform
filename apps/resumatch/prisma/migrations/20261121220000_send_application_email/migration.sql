-- Send application by email (lib/applicationEmail/, lib/documentPdfs/).
--
-- Additive only. `applications.appliedAt` is nullable: existing rows have no
-- known submission time and keep working. The new tables start empty.
--
-- Immutability is enforced here, not only in code: a sent email's snapshot,
-- its attachment rows and the rendered PDFs cannot be changed by any UPDATE,
-- whatever the caller. Only a sent email's outcome and delivery columns move,
-- and its outcome only forward (SENDING -> ACCEPTED | FAILED | UNCERTAIN,
-- UNCERTAIN -> ACCEPTED | FAILED); ACCEPTED and FAILED are final.

-- CreateEnum
CREATE TYPE "DocumentPdfKind" AS ENUM ('CV', 'COVER_LETTER');

-- CreateEnum
CREATE TYPE "SentEmailStatus" AS ENUM ('SENDING', 'ACCEPTED', 'FAILED', 'UNCERTAIN');

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "appliedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "document_pdfs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "DocumentPdfKind" NOT NULL,
    "tailoredResumeId" TEXT,
    "coverLetterId" TEXT,
    "targetJobId" TEXT NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_pdfs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_email_drafts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "toEmail" TEXT,
    "contactName" TEXT,
    "subject" TEXT,
    "body" TEXT,
    "subjectEdited" BOOLEAN NOT NULL DEFAULT false,
    "bodyEdited" BOOLEAN NOT NULL DEFAULT false,
    "sendCopyToSelf" BOOLEAN NOT NULL DEFAULT true,
    "cvPdfId" TEXT,
    "coverLetterPdfId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_email_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sent_application_emails" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "applicationId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "targetJobId" TEXT NOT NULL,
    "companyKey" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "jobTitle" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT NOT NULL,
    "contactEmailNormalized" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "replyTo" TEXT,
    "bccSelf" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "status" "SentEmailStatus" NOT NULL DEFAULT 'SENDING',
    "providerResponse" TEXT,
    "providerMessageId" TEXT,
    "errorCode" TEXT,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'not_tracked',
    "deliveryUpdatedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "statusTransition" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "sent_application_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sent_application_attachments" (
    "id" TEXT NOT NULL,
    "sentEmailId" TEXT NOT NULL,
    "documentPdfId" TEXT NOT NULL,
    "kind" "DocumentPdfKind" NOT NULL,
    "filename" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,

    CONSTRAINT "sent_application_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_pdfs_storageKey_key" ON "document_pdfs"("storageKey");

-- CreateIndex
CREATE INDEX "document_pdfs_workspaceId_tailoredResumeId_createdAt_idx" ON "document_pdfs"("workspaceId", "tailoredResumeId", "createdAt");

-- CreateIndex
CREATE INDEX "document_pdfs_workspaceId_coverLetterId_createdAt_idx" ON "document_pdfs"("workspaceId", "coverLetterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "application_email_drafts_applicationId_key" ON "application_email_drafts"("applicationId");

-- CreateIndex
CREATE INDEX "application_email_drafts_workspaceId_idx" ON "application_email_drafts"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "sent_application_emails_idempotencyKey_key" ON "sent_application_emails"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "sent_application_emails_messageId_key" ON "sent_application_emails"("messageId");

-- CreateIndex
CREATE INDEX "sent_application_emails_workspaceId_attemptedAt_idx" ON "sent_application_emails"("workspaceId", "attemptedAt");

-- CreateIndex
CREATE INDEX "sent_application_emails_workspaceId_companyKey_idx" ON "sent_application_emails"("workspaceId", "companyKey");

-- CreateIndex
CREATE INDEX "sent_application_emails_workspaceId_contactEmailNormalized_idx" ON "sent_application_emails"("workspaceId", "contactEmailNormalized");

-- CreateIndex
CREATE INDEX "sent_application_emails_applicationId_attemptedAt_idx" ON "sent_application_emails"("applicationId", "attemptedAt");

-- CreateIndex
CREATE INDEX "sent_application_attachments_documentPdfId_idx" ON "sent_application_attachments"("documentPdfId");

-- CreateIndex
CREATE UNIQUE INDEX "sent_application_attachments_sentEmailId_kind_key" ON "sent_application_attachments"("sentEmailId", "kind");

-- AddForeignKey
ALTER TABLE "document_pdfs" ADD CONSTRAINT "document_pdfs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_pdfs" ADD CONSTRAINT "document_pdfs_tailoredResumeId_fkey" FOREIGN KEY ("tailoredResumeId") REFERENCES "tailored_resumes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_pdfs" ADD CONSTRAINT "document_pdfs_coverLetterId_fkey" FOREIGN KEY ("coverLetterId") REFERENCES "cover_letters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_email_drafts" ADD CONSTRAINT "application_email_drafts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_email_drafts" ADD CONSTRAINT "application_email_drafts_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_email_drafts" ADD CONSTRAINT "application_email_drafts_cvPdfId_fkey" FOREIGN KEY ("cvPdfId") REFERENCES "document_pdfs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_email_drafts" ADD CONSTRAINT "application_email_drafts_coverLetterPdfId_fkey" FOREIGN KEY ("coverLetterPdfId") REFERENCES "document_pdfs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sent_application_emails" ADD CONSTRAINT "sent_application_emails_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sent_application_emails" ADD CONSTRAINT "sent_application_emails_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sent_application_attachments" ADD CONSTRAINT "sent_application_attachments_sentEmailId_fkey" FOREIGN KEY ("sentEmailId") REFERENCES "sent_application_emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- A sent PDF can never be deleted on its own. Checked at commit, so deleting
-- a whole workspace (which cascades to both tables in no fixed order) works.
ALTER TABLE "sent_application_attachments" ADD CONSTRAINT "sent_application_attachments_documentPdfId_fkey" FOREIGN KEY ("documentPdfId") REFERENCES "document_pdfs"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;


-- Immutability triggers ------------------------------------------------------

CREATE OR REPLACE FUNCTION "sent_application_emails_guard_update"() RETURNS trigger AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
     -- applicationId may only be cleared (ON DELETE SET NULL of the application).
     OR (NEW."applicationId" IS DISTINCT FROM OLD."applicationId" AND NEW."applicationId" IS NOT NULL)
     OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
     OR NEW."targetJobId" IS DISTINCT FROM OLD."targetJobId"
     OR NEW."companyKey" IS DISTINCT FROM OLD."companyKey"
     OR NEW."companyName" IS DISTINCT FROM OLD."companyName"
     OR NEW."jobTitle" IS DISTINCT FROM OLD."jobTitle"
     OR NEW."contactName" IS DISTINCT FROM OLD."contactName"
     OR NEW."contactEmail" IS DISTINCT FROM OLD."contactEmail"
     OR NEW."contactEmailNormalized" IS DISTINCT FROM OLD."contactEmailNormalized"
     OR NEW."fromAddress" IS DISTINCT FROM OLD."fromAddress"
     OR NEW."replyTo" IS DISTINCT FROM OLD."replyTo"
     OR NEW."bccSelf" IS DISTINCT FROM OLD."bccSelf"
     OR NEW."subject" IS DISTINCT FROM OLD."subject"
     OR NEW."body" IS DISTINCT FROM OLD."body"
     OR NEW."messageId" IS DISTINCT FROM OLD."messageId"
     OR NEW."attemptedAt" IS DISTINCT FROM OLD."attemptedAt"
     OR (OLD."sentAt" IS NOT NULL AND NEW."sentAt" IS DISTINCT FROM OLD."sentAt")
     OR (OLD."appliedAt" IS NOT NULL AND NEW."appliedAt" IS DISTINCT FROM OLD."appliedAt")
  THEN
    RAISE EXCEPTION 'sent_application_emails content is immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
       (OLD."status" = 'SENDING' AND NEW."status" IN ('ACCEPTED', 'FAILED', 'UNCERTAIN'))
    OR (OLD."status" = 'UNCERTAIN' AND NEW."status" IN ('ACCEPTED', 'FAILED'))
  ) THEN
    RAISE EXCEPTION 'sent_application_emails status % cannot become %', OLD."status", NEW."status"
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "sent_application_emails_immutable"
  BEFORE UPDATE ON "sent_application_emails"
  FOR EACH ROW EXECUTE FUNCTION "sent_application_emails_guard_update"();

CREATE OR REPLACE FUNCTION "sent_application_attachments_reject_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'sent_application_attachments is insert-only'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "sent_application_attachments_no_update"
  BEFORE UPDATE ON "sent_application_attachments"
  FOR EACH ROW EXECUTE FUNCTION "sent_application_attachments_reject_update"();

-- A rendered PDF never changes; only its two source links may be cleared
-- (ON DELETE SET NULL when the CV or letter is deleted).
CREATE OR REPLACE FUNCTION "document_pdfs_guard_update"() RETURNS trigger AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
     OR NEW."kind" IS DISTINCT FROM OLD."kind"
     OR (NEW."tailoredResumeId" IS DISTINCT FROM OLD."tailoredResumeId" AND NEW."tailoredResumeId" IS NOT NULL)
     OR (NEW."coverLetterId" IS DISTINCT FROM OLD."coverLetterId" AND NEW."coverLetterId" IS NOT NULL)
     OR NEW."targetJobId" IS DISTINCT FROM OLD."targetJobId"
     OR NEW."sourceFingerprint" IS DISTINCT FROM OLD."sourceFingerprint"
     OR NEW."storageKey" IS DISTINCT FROM OLD."storageKey"
     OR NEW."filename" IS DISTINCT FROM OLD."filename"
     OR NEW."byteSize" IS DISTINCT FROM OLD."byteSize"
     OR NEW."contentHash" IS DISTINCT FROM OLD."contentHash"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'document_pdfs rows are immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "document_pdfs_immutable"
  BEFORE UPDATE ON "document_pdfs"
  FOR EACH ROW EXECUTE FUNCTION "document_pdfs_guard_update"();
