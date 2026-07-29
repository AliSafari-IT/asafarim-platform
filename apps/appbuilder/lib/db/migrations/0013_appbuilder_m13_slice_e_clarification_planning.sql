CREATE TYPE "public"."modification_plan_status" AS ENUM('draft', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."modification_plan_step_status" AS ENUM('pending', 'running', 'awaiting_confirmation', 'applied', 'failed', 'skipped');--> statement-breakpoint
ALTER TYPE "public"."conversation_message_type" ADD VALUE 'clarification_question';--> statement-breakpoint
ALTER TYPE "public"."conversation_message_type" ADD VALUE 'clarification_answer';--> statement-breakpoint
ALTER TYPE "public"."conversation_message_type" ADD VALUE 'plan';--> statement-breakpoint
ALTER TYPE "public"."conversation_message_type" ADD VALUE 'capability_notice';--> statement-breakpoint
ALTER TYPE "public"."modification_job_failure_code" ADD VALUE 'unsupported_request';--> statement-breakpoint
ALTER TYPE "public"."modification_job_failure_code" ADD VALUE 'clarification_expired';--> statement-breakpoint
ALTER TYPE "public"."modification_job_status" ADD VALUE 'needs_clarification' BEFORE 'proposing';--> statement-breakpoint
CREATE TABLE "modification_plan_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"app_id" text NOT NULL,
	"step_number" integer NOT NULL,
	"title" text NOT NULL,
	"operation_batch" jsonb NOT NULL,
	"status" "modification_plan_step_status" DEFAULT 'pending' NOT NULL,
	"modification_job_id" text,
	"resulting_version_number" integer,
	"failure_code" "modification_job_failure_code",
	"failure_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modification_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"triggering_message_id" text NOT NULL,
	"status" "modification_plan_status" DEFAULT 'draft' NOT NULL,
	"base_version_number" integer NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"capability_assessment" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "modification_jobs" ADD COLUMN "clarification_state" jsonb;--> statement-breakpoint
ALTER TABLE "modification_jobs" ADD COLUMN "plan_step_id" text;--> statement-breakpoint
ALTER TABLE "modification_plan_steps" ADD CONSTRAINT "modification_plan_steps_plan_id_modification_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."modification_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modification_plan_steps" ADD CONSTRAINT "modification_plan_steps_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modification_plan_steps" ADD CONSTRAINT "modification_plan_steps_modification_job_id_modification_jobs_id_fk" FOREIGN KEY ("modification_job_id") REFERENCES "public"."modification_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modification_plans" ADD CONSTRAINT "modification_plans_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modification_plans" ADD CONSTRAINT "modification_plans_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modification_plans" ADD CONSTRAINT "modification_plans_triggering_message_id_conversation_messages_id_fk" FOREIGN KEY ("triggering_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "modification_plan_steps_plan_step_unique" ON "modification_plan_steps" USING btree ("plan_id","step_number");--> statement-breakpoint
CREATE INDEX "modification_plan_steps_app_id_idx" ON "modification_plan_steps" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "modification_plan_steps_modification_job_id_idx" ON "modification_plan_steps" USING btree ("modification_job_id");--> statement-breakpoint
CREATE INDEX "modification_plans_app_id_idx" ON "modification_plans" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "modification_plans_conversation_id_idx" ON "modification_plans" USING btree ("conversation_id");--> statement-breakpoint
ALTER TABLE "modification_jobs" ADD CONSTRAINT "modification_jobs_plan_step_id_modification_plan_steps_id_fk" FOREIGN KEY ("plan_step_id") REFERENCES "public"."modification_plan_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "modification_jobs_plan_step_id_idx" ON "modification_jobs" USING btree ("plan_step_id");