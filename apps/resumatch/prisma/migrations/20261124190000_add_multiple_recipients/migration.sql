-- Send an application to up to 3 recipients (#944).
--
-- Additive only. One message, several "To" addresses: the first stays in
-- the existing columns (contactEmail, toEmail), so every older row and
-- draft reads exactly as before. New array columns default to empty.
--
-- recipientsNormalized holds every recipient, lower-cased, for the history
-- filter "everything sent to them". It is derived, never typed: an insert
-- trigger fills it from contactEmailNormalized and additionalRecipients, so
-- no writer can leave it out or get it wrong. Older rows are backfilled. The immutability trigger is replaced to cover the
-- new snapshot columns; rejectedRecipients may only be written together
-- with the move to ACCEPTED.

-- AlterTable
ALTER TABLE "application_email_drafts" ADD COLUMN "additionalToEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "sent_application_emails" ADD COLUMN "additionalRecipients" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "recipientsNormalized" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "rejectedRecipients" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill. Runs before the trigger below is extended: the current guard
-- does not know the new column yet, so this one-time write passes it, and
-- every later change to the column is refused.
UPDATE "sent_application_emails" SET "recipientsNormalized" = ARRAY["contactEmailNormalized"];

-- CreateIndex
CREATE INDEX "sent_application_emails_recipientsNormalized_idx" ON "sent_application_emails" USING GIN ("recipientsNormalized");

-- Immutability trigger, extended -----------------------------------------

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
     OR NEW."additionalRecipients" IS DISTINCT FROM OLD."additionalRecipients"
     OR NEW."recipientsNormalized" IS DISTINCT FROM OLD."recipientsNormalized"
     -- Refused recipients are recorded once, with the acceptance itself.
     OR (NEW."rejectedRecipients" IS DISTINCT FROM OLD."rejectedRecipients"
         AND NOT (OLD."status" IN ('SENDING', 'UNCERTAIN') AND NEW."status" = 'ACCEPTED'))
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


-- recipientsNormalized, derived on insert ---------------------------------

CREATE OR REPLACE FUNCTION "sent_application_emails_set_recipients"() RETURNS trigger AS $$
BEGIN
  NEW."recipientsNormalized" := ARRAY[NEW."contactEmailNormalized"]
    || COALESCE((SELECT array_agg(lower(btrim(r)) ORDER BY i) FROM unnest(NEW."additionalRecipients") WITH ORDINALITY AS t(r, i)), ARRAY[]::TEXT[]);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "sent_application_emails_recipients"
  BEFORE INSERT ON "sent_application_emails"
  FOR EACH ROW EXECUTE FUNCTION "sent_application_emails_set_recipients"();
