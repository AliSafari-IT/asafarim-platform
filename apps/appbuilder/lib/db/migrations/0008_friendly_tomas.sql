CREATE TYPE "public"."app_domain_kind" AS ENUM('auto_slug', 'custom');--> statement-breakpoint
CREATE TYPE "public"."app_domain_status" AS ENUM('reserved', 'active', 'released');--> statement-breakpoint
CREATE TYPE "public"."deployment_failure_code" AS ENUM('not_eligible', 'stale_approval', 'slug_unavailable', 'slug_reserved', 'data_incompatible', 'artifact_preparation_failed', 'health_check_failed', 'smoke_test_failed', 'activation_failed', 'post_activation_verification_failed', 'authorization_lost', 'app_archived', 'worker_infrastructure_error', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."deployment_phase" AS ENUM('queued', 'checking_eligibility', 'freezing_manifest', 'reserving_slug', 'checking_data_compatibility', 'preparing_artifact', 'publishing', 'health_checking', 'smoke_testing', 'activating', 'verifying', 'completed', 'rolling_back');--> statement-breakpoint
CREATE TYPE "public"."generated_environment" AS ENUM('preview', 'production');--> statement-breakpoint
ALTER TYPE "public"."deployment_status" ADD VALUE 'running' BEFORE 'succeeded';--> statement-breakpoint
ALTER TYPE "public"."deployment_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TYPE "public"."deployment_status" ADD VALUE 'rolled_back';--> statement-breakpoint
ALTER TYPE "public"."release_status" ADD VALUE 'approved' BEFORE 'published';--> statement-breakpoint
ALTER TYPE "public"."release_status" ADD VALUE 'superseded' BEFORE 'archived';--> statement-breakpoint
CREATE TABLE "app_domains" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"host" text NOT NULL,
	"kind" "app_domain_kind" DEFAULT 'auto_slug' NOT NULL,
	"status" "app_domain_status" DEFAULT 'reserved' NOT NULL,
	"active_release_id" text,
	"activated_at" timestamp with time zone,
	"reserved_by_principal_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"deployment_id" text NOT NULL,
	"app_id" text NOT NULL,
	"phase" "deployment_phase" NOT NULL,
	"ok" boolean NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "generated_activity_app_id_idx";--> statement-breakpoint
DROP INDEX "generated_app_members_app_principal_unique";--> statement-breakpoint
DROP INDEX "generated_app_members_app_id_idx";--> statement-breakpoint
DROP INDEX "generated_files_app_id_idx";--> statement-breakpoint
DROP INDEX "generated_notifications_app_recipient_idx";--> statement-breakpoint
DROP INDEX "generated_record_relations_app_id_idx";--> statement-breakpoint
DROP INDEX "generated_record_revisions_app_id_idx";--> statement-breakpoint
DROP INDEX "generated_records_app_entity_idx";--> statement-breakpoint
DROP INDEX "generated_records_app_entity_status_idx";--> statement-breakpoint
DROP INDEX "generated_workflow_executions_app_id_idx";--> statement-breakpoint
DROP INDEX "generated_data_idempotency_unique";--> statement-breakpoint
DROP INDEX "generated_row_access_rules_unique";--> statement-breakpoint
DROP INDEX "generated_uniqueness_claims_unique";--> statement-breakpoint
DROP INDEX "generated_workflow_executions_idempotency_unique";--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "phase" "deployment_phase" DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "is_rollback" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "superseded_release_id" text;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "idempotency_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "request_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "failure_code" "deployment_failure_code";--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "failure_message" text;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "cancel_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "cancelled_by_principal_id" text;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "lease_owner" text;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_activity" ADD COLUMN "environment" "generated_environment" DEFAULT 'preview' NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_app_members" ADD COLUMN "environment" "generated_environment" DEFAULT 'preview' NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_data_idempotency" ADD COLUMN "environment" "generated_environment" DEFAULT 'preview' NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_files" ADD COLUMN "environment" "generated_environment" DEFAULT 'preview' NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_notifications" ADD COLUMN "environment" "generated_environment" DEFAULT 'preview' NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_record_relations" ADD COLUMN "environment" "generated_environment" DEFAULT 'preview' NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_record_revisions" ADD COLUMN "environment" "generated_environment" DEFAULT 'preview' NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_records" ADD COLUMN "environment" "generated_environment" DEFAULT 'preview' NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_row_access_rules" ADD COLUMN "environment" "generated_environment" DEFAULT 'preview' NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_uniqueness_claims" ADD COLUMN "environment" "generated_environment" DEFAULT 'preview' NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_workflow_executions" ADD COLUMN "environment" "generated_environment" DEFAULT 'preview' NOT NULL;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "specification_version_number" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "specification_checksum" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "schema_version" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "preview_build_id" text;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "preview_checksum" text;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "registry_version" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "validation_run_id" text;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "gate_set_version" text;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "data_compatibility" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "data_compatibility_detail" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "manifest" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "manifest_checksum" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "app_slug" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "production_host" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "prepared_by_principal_id" text;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "approved_by_principal_id" text;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "previous_release_id" text;--> statement-breakpoint
ALTER TABLE "app_domains" ADD CONSTRAINT "app_domains_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_domains" ADD CONSTRAINT "app_domains_active_release_id_releases_id_fk" FOREIGN KEY ("active_release_id") REFERENCES "public"."releases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_steps" ADD CONSTRAINT "deployment_steps_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_steps" ADD CONSTRAINT "deployment_steps_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_domains_host_unique" ON "app_domains" USING btree ("host");--> statement-breakpoint
CREATE UNIQUE INDEX "app_domains_app_kind_unique" ON "app_domains" USING btree ("app_id","kind");--> statement-breakpoint
CREATE INDEX "app_domains_app_id_idx" ON "app_domains" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deployment_steps_deployment_phase_unique" ON "deployment_steps" USING btree ("deployment_id","phase");--> statement-breakpoint
CREATE INDEX "deployment_steps_app_id_idx" ON "deployment_steps" USING btree ("app_id");--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_preview_build_id_preview_builds_id_fk" FOREIGN KEY ("preview_build_id") REFERENCES "public"."preview_builds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_validation_run_id_validation_runs_id_fk" FOREIGN KEY ("validation_run_id") REFERENCES "public"."validation_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deployments_status_idx" ON "deployments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "deployments_status_lease_idx" ON "deployments" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deployments_app_idempotency_unique" ON "deployments" USING btree ("app_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "generated_activity_app_env_idx" ON "generated_activity" USING btree ("app_id","environment");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_app_members_app_env_principal_unique" ON "generated_app_members" USING btree ("app_id","environment","principal_id");--> statement-breakpoint
CREATE INDEX "generated_app_members_app_env_idx" ON "generated_app_members" USING btree ("app_id","environment");--> statement-breakpoint
CREATE INDEX "generated_files_app_env_idx" ON "generated_files" USING btree ("app_id","environment");--> statement-breakpoint
CREATE INDEX "generated_notifications_app_env_recipient_idx" ON "generated_notifications" USING btree ("app_id","environment","recipient_principal_id");--> statement-breakpoint
CREATE INDEX "generated_record_relations_app_env_idx" ON "generated_record_relations" USING btree ("app_id","environment");--> statement-breakpoint
CREATE INDEX "generated_record_revisions_app_env_idx" ON "generated_record_revisions" USING btree ("app_id","environment");--> statement-breakpoint
CREATE INDEX "generated_records_app_env_entity_idx" ON "generated_records" USING btree ("app_id","environment","entity_id");--> statement-breakpoint
CREATE INDEX "generated_records_app_env_entity_status_idx" ON "generated_records" USING btree ("app_id","environment","entity_id","status");--> statement-breakpoint
CREATE INDEX "generated_workflow_executions_app_env_idx" ON "generated_workflow_executions" USING btree ("app_id","environment");--> statement-breakpoint
CREATE INDEX "releases_app_status_idx" ON "releases" USING btree ("app_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "releases_app_spec_version_unique" ON "releases" USING btree ("app_id","specification_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_data_idempotency_unique" ON "generated_data_idempotency" USING btree ("app_id","environment","entity_id","scope","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_row_access_rules_unique" ON "generated_row_access_rules" USING btree ("app_id","environment","entity_id","role_id","verb");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_uniqueness_claims_unique" ON "generated_uniqueness_claims" USING btree ("app_id","environment","entity_id","field_id","value_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_workflow_executions_idempotency_unique" ON "generated_workflow_executions" USING btree ("app_id","environment","idempotency_key");