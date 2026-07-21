ALTER TYPE "public"."script_type" ADD VALUE 'scripted';--> statement-breakpoint
ALTER TABLE "test_cases" ADD COLUMN "script" text;