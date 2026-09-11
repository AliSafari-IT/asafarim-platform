CREATE TYPE "public"."pending_scenario_state" AS ENUM('pending', 'authoring', 'active', 'passing', 'failing', 'quarantined');--> statement-breakpoint
CREATE TABLE "provisions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"fr_id" text NOT NULL,
	"task_ref" text NOT NULL,
	"check_ref" text NOT NULL,
	"feature_title" text NOT NULL,
	"callback_url" text NOT NULL,
	"required_runs" integer DEFAULT 3 NOT NULL,
	"causation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "test_cases" ADD COLUMN "scenario_state" "pending_scenario_state" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "test_cases" ADD COLUMN "provision_id" text;--> statement-breakpoint
ALTER TABLE "test_cases" ADD COLUMN "criterion_ref" text;--> statement-breakpoint
CREATE UNIQUE INDEX "provisions_task_ref_unique" ON "provisions" USING btree ("task_ref");