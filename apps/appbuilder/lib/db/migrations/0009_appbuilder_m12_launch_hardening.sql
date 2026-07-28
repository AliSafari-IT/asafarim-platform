CREATE TYPE "public"."backup_kind" AS ENUM('database', 'object_storage');--> statement-breakpoint
CREATE TYPE "public"."backup_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."backup_trigger" AS ENUM('scheduled', 'manual');--> statement-breakpoint
CREATE TYPE "public"."custom_domain_status" AS ENUM('pending_verification', 'verified', 'blocked', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."custom_domain_tls_state" AS ENUM('not_started', 'pending', 'issued', 'failed');--> statement-breakpoint
CREATE TYPE "public"."data_subject_request_kind" AS ENUM('export', 'deletion');--> statement-breakpoint
CREATE TYPE "public"."data_subject_request_status" AS ENUM('received', 'in_progress', 'completed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."operational_event_severity" AS ENUM('info', 'warning', 'error');--> statement-breakpoint
CREATE TYPE "public"."quota_scope_type" AS ENUM('owner', 'app');--> statement-breakpoint
CREATE TYPE "public"."restore_rehearsal_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."usage_event_kind" AS ENUM('ai_generation_request', 'ai_modification_request', 'ai_repair_request', 'preview_build', 'validation_run', 'deployment', 'workflow_execution', 'storage_write');--> statement-breakpoint
CREATE TABLE "backup_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "backup_kind" NOT NULL,
	"status" "backup_status" DEFAULT 'running' NOT NULL,
	"trigger" "backup_trigger" DEFAULT 'manual' NOT NULL,
	"location" text NOT NULL,
	"size_bytes" integer,
	"checksum" text,
	"encryption" text DEFAULT 'at-rest (provider-managed)' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"failure_message" text,
	"retention_expires_at" timestamp with time zone,
	"triggered_by_principal_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "custom_domain_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"requested_host" text NOT NULL,
	"status" "custom_domain_status" DEFAULT 'pending_verification' NOT NULL,
	"verification_token" text NOT NULL,
	"verification_method" text DEFAULT 'dns_txt' NOT NULL,
	"verified_at" timestamp with time zone,
	"tls_state" "custom_domain_tls_state" DEFAULT 'not_started' NOT NULL,
	"release_id" text,
	"requested_by_principal_id" text NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_subject_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"requested_by_principal_id" text NOT NULL,
	"app_id" text,
	"kind" "data_subject_request_kind" NOT NULL,
	"status" "data_subject_request_status" DEFAULT 'received' NOT NULL,
	"notes" text,
	"result_location" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by_principal_id" text
);
--> statement-breakpoint
CREATE TABLE "operational_events" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text,
	"correlation_id" text,
	"category" text NOT NULL,
	"kind" text NOT NULL,
	"severity" "operational_event_severity" DEFAULT 'info' NOT NULL,
	"actor_principal_id" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quota_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"scope_type" "quota_scope_type" NOT NULL,
	"scope_id" text NOT NULL,
	"metric" text NOT NULL,
	"limit_value" integer NOT NULL,
	"reason" text NOT NULL,
	"created_by_principal_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_principal_id" text
);
--> statement-breakpoint
CREATE TABLE "restore_rehearsals" (
	"id" text PRIMARY KEY NOT NULL,
	"backup_run_id" text NOT NULL,
	"status" "restore_rehearsal_status" DEFAULT 'running' NOT NULL,
	"target_description" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"verified_counts" jsonb,
	"findings" jsonb DEFAULT '{}'::jsonb,
	"failure_message" text,
	"performed_by_principal_id" text
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text,
	"owner_principal_id" text NOT NULL,
	"environment" "generated_environment",
	"kind" "usage_event_kind" NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit" text DEFAULT 'count' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_domain_requests" ADD CONSTRAINT "custom_domain_requests_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_domain_requests" ADD CONSTRAINT "custom_domain_requests_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_events" ADD CONSTRAINT "operational_events_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restore_rehearsals" ADD CONSTRAINT "restore_rehearsals_backup_run_id_backup_runs_id_fk" FOREIGN KEY ("backup_run_id") REFERENCES "public"."backup_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backup_runs_kind_started_idx" ON "backup_runs" USING btree ("kind","started_at");--> statement-breakpoint
CREATE INDEX "backup_runs_status_idx" ON "backup_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_domain_requests_host_unique" ON "custom_domain_requests" USING btree ("requested_host");--> statement-breakpoint
CREATE INDEX "custom_domain_requests_app_id_idx" ON "custom_domain_requests" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "data_subject_requests_owner_idx" ON "data_subject_requests" USING btree ("requested_by_principal_id");--> statement-breakpoint
CREATE INDEX "operational_events_app_id_idx" ON "operational_events" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "operational_events_category_created_idx" ON "operational_events" USING btree ("category","created_at");--> statement-breakpoint
CREATE INDEX "operational_events_correlation_idx" ON "operational_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "quota_overrides_scope_idx" ON "quota_overrides" USING btree ("scope_type","scope_id","metric");--> statement-breakpoint
CREATE INDEX "restore_rehearsals_backup_run_idx" ON "restore_rehearsals" USING btree ("backup_run_id");--> statement-breakpoint
CREATE INDEX "usage_events_app_id_idx" ON "usage_events" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "usage_events_owner_occurred_idx" ON "usage_events" USING btree ("owner_principal_id","occurred_at");--> statement-breakpoint
CREATE INDEX "usage_events_kind_occurred_idx" ON "usage_events" USING btree ("kind","occurred_at");