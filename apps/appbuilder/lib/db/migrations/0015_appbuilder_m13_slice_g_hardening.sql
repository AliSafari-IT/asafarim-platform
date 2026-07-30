-- M13 slice G — hardening, rollout, and quality gates.
--
-- Additive only: two nullable trace columns and their indexes. Nothing is
-- backfilled and nothing is rewritten, so this migration is safe to apply
-- ahead of the code that writes the columns, and safe to leave in place if
-- slice G's application code is rolled back (see
-- docs/appbuilder-m13-hardening-rollout.md, "Rollback").

ALTER TABLE "modification_jobs" ADD COLUMN IF NOT EXISTS "correlation_id" text;
--> statement-breakpoint
ALTER TABLE "conversation_attachments" ADD COLUMN IF NOT EXISTS "correlation_id" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "modification_jobs_correlation_idx" ON "modification_jobs" USING btree ("correlation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_attachments_correlation_idx" ON "conversation_attachments" USING btree ("correlation_id");
