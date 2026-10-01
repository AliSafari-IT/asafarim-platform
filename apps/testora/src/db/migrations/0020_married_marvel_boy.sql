ALTER TABLE "projects" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "verification_token" text;--> statement-breakpoint
-- Seeded (ASafariM) apps are pre-verified (#703).
UPDATE "projects" SET "verified_at" = now() WHERE "seeded" = true AND "verified_at" IS NULL;
