ALTER TABLE "target_environments" ADD COLUMN "hub_url" text;--> statement-breakpoint
-- Backfill the built-in targets (the seed keeps them in sync afterwards, #700):
-- Local signs in through the local Hub, every other built-in through production Hub.
UPDATE "target_environments" SET "hub_url" = 'http://localhost:3001' WHERE "seeded" = true AND "id" LIKE '%:local';--> statement-breakpoint
UPDATE "target_environments" SET "hub_url" = 'https://hub.asafarim.com' WHERE "seeded" = true AND "id" NOT LIKE '%:local';
