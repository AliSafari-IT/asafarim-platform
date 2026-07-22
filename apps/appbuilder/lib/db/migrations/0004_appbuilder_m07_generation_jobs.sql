CREATE TYPE "public"."generation_batch_status" AS ENUM('applied', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."generation_job_failure_code" AS ENUM('invalid_request', 'provider_configuration_error', 'provider_rate_limit', 'provider_unavailable', 'malformed_provider_response', 'forbidden_operation', 'specification_validation_failed', 'stale_base_version', 'authorization_lost', 'preview_failed', 'worker_infrastructure_error', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."generation_job_status" AS ENUM('queued', 'analyzing', 'needs_clarification', 'planning', 'applying', 'validating', 'preparing_preview', 'ready', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "generation_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"creation_request_id" text NOT NULL,
	"initiated_by_principal_id" text NOT NULL,
	"status" "generation_job_status" DEFAULT 'queued' NOT NULL,
	"phase" text DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"base_version_number" integer NOT NULL,
	"requested_template_id" text NOT NULL,
	"selected_template_id" text,
	"template_selection" jsonb,
	"normalized_requirements" jsonb,
	"clarification_state" jsonb,
	"total_operations_applied" integer DEFAULT 0 NOT NULL,
	"resulting_version_number" integer,
	"resulting_version_id" text,
	"resulting_preview_build_id" text,
	"provider_name" text,
	"provider_model" text,
	"usage" jsonb DEFAULT '{}'::jsonb,
	"failure_code" "generation_job_failure_code",
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
CREATE TABLE "generation_operation_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"app_id" text NOT NULL,
	"iteration" integer NOT NULL,
	"reasoning_summary" text DEFAULT '' NOT NULL,
	"is_final_batch" boolean DEFAULT false NOT NULL,
	"proposed_operation_count" integer DEFAULT 0 NOT NULL,
	"applied_operation_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "generation_batch_status" NOT NULL,
	"rejection_reason" text,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_creation_request_id_creation_requests_id_fk" FOREIGN KEY ("creation_request_id") REFERENCES "public"."creation_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_resulting_version_id_specification_versions_id_fk" FOREIGN KEY ("resulting_version_id") REFERENCES "public"."specification_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_resulting_preview_build_id_preview_builds_id_fk" FOREIGN KEY ("resulting_preview_build_id") REFERENCES "public"."preview_builds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_operation_batches" ADD CONSTRAINT "generation_operation_batches_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_operation_batches" ADD CONSTRAINT "generation_operation_batches_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "generation_jobs_app_idempotency_unique" ON "generation_jobs" USING btree ("app_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "generation_jobs_app_id_idx" ON "generation_jobs" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "generation_jobs_status_idx" ON "generation_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "generation_jobs_status_lease_idx" ON "generation_jobs" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_operation_batches_job_iteration_unique" ON "generation_operation_batches" USING btree ("job_id","iteration");--> statement-breakpoint
CREATE INDEX "generation_operation_batches_app_id_idx" ON "generation_operation_batches" USING btree ("app_id");