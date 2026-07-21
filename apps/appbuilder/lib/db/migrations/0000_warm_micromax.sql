CREATE TYPE "public"."app_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."collaborator_role" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."collaborator_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."deployment_environment" AS ENUM('preview', 'production');--> statement-breakpoint
CREATE TYPE "public"."deployment_status" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."idempotency_status" AS ENUM('in_progress', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."operation_status" AS ENUM('applied', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."preview_build_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."release_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."specification_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "applied_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"specification_id" text NOT NULL,
	"resulting_version_id" text,
	"operation_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "operation_status" NOT NULL,
	"rejection_reason" text,
	"applied_by_principal_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apps" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_principal_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "app_status" DEFAULT 'active' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"actor_principal_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collaborators" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"principal_id" text NOT NULL,
	"role" "collaborator_role" DEFAULT 'viewer' NOT NULL,
	"status" "collaborator_status" DEFAULT 'active' NOT NULL,
	"invited_by_principal_id" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployments" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"release_id" text NOT NULL,
	"environment" "deployment_environment" NOT NULL,
	"status" "deployment_status" DEFAULT 'pending' NOT NULL,
	"deployed_by_principal_id" text NOT NULL,
	"deployed_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text,
	"owner_principal_id" text NOT NULL,
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" "idempotency_status" DEFAULT 'in_progress' NOT NULL,
	"response_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preview_builds" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"specification_version_id" text NOT NULL,
	"status" "preview_build_status" DEFAULT 'queued' NOT NULL,
	"requested_by_principal_id" text NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"specification_version_id" text NOT NULL,
	"version_label" text NOT NULL,
	"status" "release_status" DEFAULT 'draft' NOT NULL,
	"published_by_principal_id" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "specification_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"specification_id" text NOT NULL,
	"app_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"created_by_principal_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "specifications" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"status" "specification_status" DEFAULT 'draft' NOT NULL,
	"current_version_number" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applied_operations" ADD CONSTRAINT "applied_operations_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applied_operations" ADD CONSTRAINT "applied_operations_specification_id_specifications_id_fk" FOREIGN KEY ("specification_id") REFERENCES "public"."specifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applied_operations" ADD CONSTRAINT "applied_operations_resulting_version_id_specification_versions_id_fk" FOREIGN KEY ("resulting_version_id") REFERENCES "public"."specification_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaborators" ADD CONSTRAINT "collaborators_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_builds" ADD CONSTRAINT "preview_builds_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_builds" ADD CONSTRAINT "preview_builds_specification_version_id_specification_versions_id_fk" FOREIGN KEY ("specification_version_id") REFERENCES "public"."specification_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_specification_version_id_specification_versions_id_fk" FOREIGN KEY ("specification_version_id") REFERENCES "public"."specification_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specification_versions" ADD CONSTRAINT "specification_versions_specification_id_specifications_id_fk" FOREIGN KEY ("specification_id") REFERENCES "public"."specifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specification_versions" ADD CONSTRAINT "specification_versions_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specifications" ADD CONSTRAINT "specifications_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "applied_operations_app_idempotency_unique" ON "applied_operations" USING btree ("app_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "applied_operations_app_id_idx" ON "applied_operations" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "apps_slug_unique" ON "apps" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "apps_owner_principal_id_idx" ON "apps" USING btree ("owner_principal_id");--> statement-breakpoint
CREATE INDEX "audit_events_app_id_idx" ON "audit_events" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collaborators_app_principal_unique" ON "collaborators" USING btree ("app_id","principal_id");--> statement-breakpoint
CREATE INDEX "collaborators_app_id_idx" ON "collaborators" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "collaborators_principal_id_idx" ON "collaborators" USING btree ("principal_id");--> statement-breakpoint
CREATE INDEX "deployments_app_id_idx" ON "deployments" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_owner_scope_key_unique" ON "idempotency_keys" USING btree ("owner_principal_id","scope","key");--> statement-breakpoint
CREATE INDEX "idempotency_keys_app_id_idx" ON "idempotency_keys" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "preview_builds_app_id_idx" ON "preview_builds" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "releases_app_version_label_unique" ON "releases" USING btree ("app_id","version_label");--> statement-breakpoint
CREATE INDEX "releases_app_id_idx" ON "releases" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "specification_versions_spec_version_unique" ON "specification_versions" USING btree ("specification_id","version_number");--> statement-breakpoint
CREATE INDEX "specification_versions_app_id_idx" ON "specification_versions" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "specifications_app_id_unique" ON "specifications" USING btree ("app_id");