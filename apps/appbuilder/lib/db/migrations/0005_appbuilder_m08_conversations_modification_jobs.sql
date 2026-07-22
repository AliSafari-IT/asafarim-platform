CREATE TYPE "public"."conversation_confirmation_state" AS ENUM('not_required', 'pending', 'confirmed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."conversation_message_type" AS ENUM('user_request', 'ai_proposal', 'system_status', 'validation_result', 'applied_change', 'failure');--> statement-breakpoint
CREATE TYPE "public"."conversation_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."modification_batch_status" AS ENUM('proposed', 'awaiting_confirmation', 'applied', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."modification_job_failure_code" AS ENUM('invalid_request', 'provider_configuration_error', 'provider_rate_limit', 'provider_unavailable', 'malformed_provider_response', 'forbidden_operation', 'specification_validation_failed', 'stale_base_version', 'authorization_lost', 'preview_failed', 'confirmation_expired', 'confirmation_invalid', 'worker_infrastructure_error', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."modification_job_status" AS ENUM('queued', 'interpreting', 'proposing', 'awaiting_confirmation', 'applying', 'validating', 'preparing_preview', 'ready', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"app_id" text NOT NULL,
	"role" "conversation_role" NOT NULL,
	"message_type" "conversation_message_type" NOT NULL,
	"content" text NOT NULL,
	"author_principal_id" text,
	"selected_context" jsonb,
	"base_version_number" integer,
	"modification_job_id" text,
	"diff_summary" jsonb,
	"impact_classification" text,
	"confirmation_state" "conversation_confirmation_state" DEFAULT 'not_required' NOT NULL,
	"resulting_version_number" integer,
	"resulting_preview_build_id" text,
	"failure_code" text,
	"failure_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"created_by_principal_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modification_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"triggering_message_id" text NOT NULL,
	"initiated_by_principal_id" text NOT NULL,
	"status" "modification_job_status" DEFAULT 'queued' NOT NULL,
	"phase" text DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"base_version_number" integer NOT NULL,
	"selection_context" jsonb,
	"user_request_text" text NOT NULL,
	"normalized_request" jsonb,
	"total_operations_applied" integer DEFAULT 0 NOT NULL,
	"confirmation_required" boolean DEFAULT false NOT NULL,
	"confirmation_checksum" text,
	"confirmation_base_version_number" integer,
	"confirmation_expires_at" timestamp with time zone,
	"confirmation_confirmed_at" timestamp with time zone,
	"confirmation_confirmed_by_principal_id" text,
	"resulting_version_number" integer,
	"resulting_version_id" text,
	"resulting_preview_build_id" text,
	"provider_name" text,
	"provider_model" text,
	"usage" jsonb DEFAULT '{}'::jsonb,
	"failure_code" "modification_job_failure_code",
	"failure_message" text,
	"cancel_requested_at" timestamp with time zone,
	"cancelled_by_principal_id" text,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modification_operation_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"app_id" text NOT NULL,
	"reasoning_summary" text DEFAULT '' NOT NULL,
	"proposed_operation_count" integer DEFAULT 0 NOT NULL,
	"applied_operation_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rejected_operations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"destructive_operations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "modification_batch_status" DEFAULT 'proposed' NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_modification_job_id_modification_jobs_id_fk" FOREIGN KEY ("modification_job_id") REFERENCES "public"."modification_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_resulting_preview_build_id_preview_builds_id_fk" FOREIGN KEY ("resulting_preview_build_id") REFERENCES "public"."preview_builds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modification_jobs" ADD CONSTRAINT "modification_jobs_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modification_jobs" ADD CONSTRAINT "modification_jobs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modification_jobs" ADD CONSTRAINT "modification_jobs_triggering_message_id_conversation_messages_id_fk" FOREIGN KEY ("triggering_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modification_jobs" ADD CONSTRAINT "modification_jobs_resulting_version_id_specification_versions_id_fk" FOREIGN KEY ("resulting_version_id") REFERENCES "public"."specification_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modification_jobs" ADD CONSTRAINT "modification_jobs_resulting_preview_build_id_preview_builds_id_fk" FOREIGN KEY ("resulting_preview_build_id") REFERENCES "public"."preview_builds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modification_operation_batches" ADD CONSTRAINT "modification_operation_batches_job_id_modification_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."modification_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modification_operation_batches" ADD CONSTRAINT "modification_operation_batches_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_messages_conversation_id_idx" ON "conversation_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_messages_app_id_idx" ON "conversation_messages" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "conversation_messages_created_at_idx" ON "conversation_messages" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_app_id_unique" ON "conversations" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "modification_jobs_app_idempotency_unique" ON "modification_jobs" USING btree ("app_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "modification_jobs_app_id_idx" ON "modification_jobs" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "modification_jobs_conversation_id_idx" ON "modification_jobs" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "modification_jobs_status_idx" ON "modification_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "modification_jobs_status_lease_idx" ON "modification_jobs" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "modification_operation_batches_job_unique" ON "modification_operation_batches" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "modification_operation_batches_app_id_idx" ON "modification_operation_batches" USING btree ("app_id");