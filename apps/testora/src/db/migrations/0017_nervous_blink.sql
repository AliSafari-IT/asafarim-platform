ALTER TABLE "issues" ADD COLUMN "fingerprint" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "linked_existing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "issues_project_fingerprint_idx" ON "issues" USING btree ("project_id","fingerprint");