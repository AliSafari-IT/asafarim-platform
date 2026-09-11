CREATE TYPE "public"."outbound_event_status" AS ENUM('pending', 'sent', 'failed', 'dead');--> statement-breakpoint
CREATE TYPE "public"."quarantine_reason" AS ENUM('manual', 'auto');--> statement-breakpoint
CREATE TABLE "outbound_events" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbound_event_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "auto_quarantine_flaky" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "test_cases" ADD COLUMN "flake_score" real;--> statement-breakpoint
ALTER TABLE "test_cases" ADD COLUMN "last_flake_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "test_cases" ADD COLUMN "quarantined" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "test_cases" ADD COLUMN "quarantined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "test_cases" ADD COLUMN "quarantine_reason" "quarantine_reason";--> statement-breakpoint
ALTER TABLE "test_suites" ADD COLUMN "quarantined" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "test_suites" ADD COLUMN "quarantined_at" timestamp with time zone;