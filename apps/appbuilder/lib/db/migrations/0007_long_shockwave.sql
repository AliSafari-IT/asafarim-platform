CREATE TYPE "public"."repair_attempt_status" AS ENUM('queued', 'classifying', 'proposing', 'awaiting_confirmation', 'applying', 'revalidating', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."repair_failure_classification" AS ENUM('user_specification_error', 'supported_repairable_configuration_error', 'unsupported_product_capability', 'test_failure', 'accessibility_failure', 'security_policy_failure', 'migration_data_safety_failure', 'provider_failure', 'infrastructure_failure', 'flaky_test', 'cancellation');--> statement-breakpoint
CREATE TYPE "public"."repair_job_failure_code" AS ENUM('invalid_request', 'not_repairable', 'provider_configuration_error', 'provider_rate_limit', 'provider_unavailable', 'malformed_provider_response', 'forbidden_operation', 'specification_validation_failed', 'stale_base_version', 'authorization_lost', 'preview_failed', 'confirmation_expired', 'confirmation_invalid', 'revalidation_failed', 'repair_budget_exhausted', 'worker_infrastructure_error', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."validation_artifact_kind" AS ENUM('screenshot', 'trace', 'report', 'log', 'summary');--> statement-breakpoint
CREATE TYPE "public"."validation_gate_status" AS ENUM('pending', 'running', 'passed', 'failed', 'skipped', 'infrastructure_error', 'flaky', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."validation_request_source" AS ENUM('manual', 'repair', 'api');--> statement-breakpoint
CREATE TYPE "public"."validation_run_status" AS ENUM('pending', 'running', 'passed', 'failed', 'infrastructure_error', 'flaky', 'cancelled');--> statement-breakpoint
CREATE TABLE "repair_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"originating_run_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"initiated_by_principal_id" text NOT NULL,
	"status" "repair_attempt_status" DEFAULT 'queued' NOT NULL,
	"phase" text DEFAULT 'queued' NOT NULL,
	"failure_classification" "repair_failure_classification",
	"target_gate_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"diagnostics_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"proposed_operation_count" integer DEFAULT 0 NOT NULL,
	"rejected_operations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"destructive_operations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"applied_operation_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confirmation_required" boolean DEFAULT false NOT NULL,
	"confirmation_checksum" text,
	"confirmation_base_version_number" integer,
	"confirmation_expires_at" timestamp with time zone,
	"confirmation_confirmed_at" timestamp with time zone,
	"confirmation_confirmed_by_principal_id" text,
	"base_version_number" integer NOT NULL,
	"resulting_version_number" integer,
	"resulting_version_id" text,
	"resulting_preview_build_id" text,
	"resulting_validation_run_id" text,
	"provider_name" text,
	"provider_model" text,
	"usage" jsonb DEFAULT '{}'::jsonb,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"failure_code" "repair_job_failure_code",
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
CREATE TABLE "validation_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"app_id" text NOT NULL,
	"gate_key" text,
	"kind" "validation_artifact_kind" NOT NULL,
	"label" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"retention_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "validation_gate_results" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"app_id" text NOT NULL,
	"gate_key" text NOT NULL,
	"gate_version" text NOT NULL,
	"mandatory" boolean DEFAULT true NOT NULL,
	"status" "validation_gate_status" DEFAULT 'pending' NOT NULL,
	"skip_reason" text,
	"failure_code" text,
	"failure_message" text,
	"structured_failures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"artifact_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duration_ms" integer,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "validation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"specification_version_id" text NOT NULL,
	"specification_checksum" text NOT NULL,
	"preview_build_id" text,
	"preview_checksum" text,
	"registry_version" text NOT NULL,
	"gate_set_version" text NOT NULL,
	"request_source" "validation_request_source" DEFAULT 'manual' NOT NULL,
	"requested_by_principal_id" text NOT NULL,
	"triggering_repair_attempt_id" text,
	"status" "validation_run_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"mandatory_gates_total" integer DEFAULT 0 NOT NULL,
	"mandatory_gates_passed" integer DEFAULT 0 NOT NULL,
	"release_eligible" boolean DEFAULT false NOT NULL,
	"failure_code" text,
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
ALTER TABLE "repair_attempts" ADD CONSTRAINT "repair_attempts_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_attempts" ADD CONSTRAINT "repair_attempts_originating_run_id_validation_runs_id_fk" FOREIGN KEY ("originating_run_id") REFERENCES "public"."validation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_attempts" ADD CONSTRAINT "repair_attempts_resulting_version_id_specification_versions_id_fk" FOREIGN KEY ("resulting_version_id") REFERENCES "public"."specification_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_attempts" ADD CONSTRAINT "repair_attempts_resulting_preview_build_id_preview_builds_id_fk" FOREIGN KEY ("resulting_preview_build_id") REFERENCES "public"."preview_builds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_attempts" ADD CONSTRAINT "repair_attempts_resulting_validation_run_id_validation_runs_id_fk" FOREIGN KEY ("resulting_validation_run_id") REFERENCES "public"."validation_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_artifacts" ADD CONSTRAINT "validation_artifacts_run_id_validation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."validation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_artifacts" ADD CONSTRAINT "validation_artifacts_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_gate_results" ADD CONSTRAINT "validation_gate_results_run_id_validation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."validation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_gate_results" ADD CONSTRAINT "validation_gate_results_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD CONSTRAINT "validation_runs_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD CONSTRAINT "validation_runs_specification_version_id_specification_versions_id_fk" FOREIGN KEY ("specification_version_id") REFERENCES "public"."specification_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD CONSTRAINT "validation_runs_preview_build_id_preview_builds_id_fk" FOREIGN KEY ("preview_build_id") REFERENCES "public"."preview_builds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD CONSTRAINT "validation_runs_triggering_repair_attempt_id_repair_attempts_id_fk" FOREIGN KEY ("triggering_repair_attempt_id") REFERENCES "public"."repair_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "repair_attempts_app_idempotency_unique" ON "repair_attempts" USING btree ("app_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "repair_attempts_run_attempt_unique" ON "repair_attempts" USING btree ("originating_run_id","attempt_number");--> statement-breakpoint
CREATE INDEX "repair_attempts_app_id_idx" ON "repair_attempts" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "repair_attempts_status_idx" ON "repair_attempts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "repair_attempts_status_lease_idx" ON "repair_attempts" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX "validation_artifacts_run_id_idx" ON "validation_artifacts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "validation_artifacts_app_id_idx" ON "validation_artifacts" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "validation_gate_results_run_gate_unique" ON "validation_gate_results" USING btree ("run_id","gate_key");--> statement-breakpoint
CREATE INDEX "validation_gate_results_app_id_idx" ON "validation_gate_results" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "validation_runs_app_idempotency_unique" ON "validation_runs" USING btree ("app_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "validation_runs_app_id_idx" ON "validation_runs" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "validation_runs_status_idx" ON "validation_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "validation_runs_status_lease_idx" ON "validation_runs" USING btree ("status","lease_expires_at");