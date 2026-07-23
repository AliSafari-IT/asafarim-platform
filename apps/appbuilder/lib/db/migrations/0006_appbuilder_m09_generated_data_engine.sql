CREATE TYPE "public"."generated_file_status" AS ENUM('pending', 'committed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."generated_member_provenance" AS ENUM('owner_bootstrap', 'invited');--> statement-breakpoint
CREATE TYPE "public"."generated_member_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."generated_record_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."generated_row_access_rule_kind" AS ENUM('all', 'own', 'assigned', 'relatedToParent');--> statement-breakpoint
CREATE TYPE "public"."generated_workflow_execution_status" AS ENUM('succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."generated_workflow_step_status" AS ENUM('applied', 'skipped', 'failed');--> statement-breakpoint
CREATE TABLE "generated_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"record_id" text,
	"action" text NOT NULL,
	"actor_principal_id" text,
	"actor_kind" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_app_members" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"principal_id" text NOT NULL,
	"role_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "generated_member_status" DEFAULT 'active' NOT NULL,
	"provenance" "generated_member_provenance" NOT NULL,
	"invited_by_principal_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_data_idempotency" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"scope" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_files" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"record_id" text,
	"field_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"status" "generated_file_status" DEFAULT 'pending' NOT NULL,
	"uploaded_by_principal_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_at" timestamp with time zone,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "generated_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"recipient_principal_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"related_record_id" text,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_record_relations" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"relation_id" text NOT NULL,
	"from_record_id" text NOT NULL,
	"to_record_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_record_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"record_id" text NOT NULL,
	"app_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"revision" integer NOT NULL,
	"data" jsonb NOT NULL,
	"changed_by_principal_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_records" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"spec_version_number" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "generated_record_status" DEFAULT 'active' NOT NULL,
	"created_by_principal_id" text NOT NULL,
	"updated_by_principal_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "generated_row_access_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"role_id" text NOT NULL,
	"verb" text NOT NULL,
	"rule_kind" "generated_row_access_rule_kind" NOT NULL,
	"rule_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_uniqueness_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"field_id" text NOT NULL,
	"value_hash" text NOT NULL,
	"record_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_workflow_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"workflow_id" text NOT NULL,
	"trigger_record_id" text NOT NULL,
	"trigger_revision" integer NOT NULL,
	"trigger_kind" text NOT NULL,
	"status" "generated_workflow_execution_status" NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"failure_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_workflow_step_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"step_id" text NOT NULL,
	"status" "generated_workflow_step_status" NOT NULL,
	"result_metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generated_activity" ADD CONSTRAINT "generated_activity_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_activity" ADD CONSTRAINT "generated_activity_record_id_generated_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."generated_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_app_members" ADD CONSTRAINT "generated_app_members_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_data_idempotency" ADD CONSTRAINT "generated_data_idempotency_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_files" ADD CONSTRAINT "generated_files_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_files" ADD CONSTRAINT "generated_files_record_id_generated_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."generated_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_notifications" ADD CONSTRAINT "generated_notifications_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_notifications" ADD CONSTRAINT "generated_notifications_related_record_id_generated_records_id_fk" FOREIGN KEY ("related_record_id") REFERENCES "public"."generated_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_record_relations" ADD CONSTRAINT "generated_record_relations_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_record_relations" ADD CONSTRAINT "generated_record_relations_from_record_id_generated_records_id_fk" FOREIGN KEY ("from_record_id") REFERENCES "public"."generated_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_record_relations" ADD CONSTRAINT "generated_record_relations_to_record_id_generated_records_id_fk" FOREIGN KEY ("to_record_id") REFERENCES "public"."generated_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_record_revisions" ADD CONSTRAINT "generated_record_revisions_record_id_generated_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."generated_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_record_revisions" ADD CONSTRAINT "generated_record_revisions_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_records" ADD CONSTRAINT "generated_records_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_row_access_rules" ADD CONSTRAINT "generated_row_access_rules_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_uniqueness_claims" ADD CONSTRAINT "generated_uniqueness_claims_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_uniqueness_claims" ADD CONSTRAINT "generated_uniqueness_claims_record_id_generated_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."generated_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_workflow_executions" ADD CONSTRAINT "generated_workflow_executions_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_workflow_executions" ADD CONSTRAINT "generated_workflow_executions_trigger_record_id_generated_records_id_fk" FOREIGN KEY ("trigger_record_id") REFERENCES "public"."generated_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_workflow_step_executions" ADD CONSTRAINT "generated_workflow_step_executions_execution_id_generated_workflow_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."generated_workflow_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generated_activity_app_id_idx" ON "generated_activity" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "generated_activity_record_id_idx" ON "generated_activity" USING btree ("record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_app_members_app_principal_unique" ON "generated_app_members" USING btree ("app_id","principal_id");--> statement-breakpoint
CREATE INDEX "generated_app_members_app_id_idx" ON "generated_app_members" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_data_idempotency_unique" ON "generated_data_idempotency" USING btree ("app_id","entity_id","scope","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_files_storage_key_unique" ON "generated_files" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "generated_files_app_id_idx" ON "generated_files" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "generated_files_record_id_idx" ON "generated_files" USING btree ("record_id");--> statement-breakpoint
CREATE INDEX "generated_notifications_app_recipient_idx" ON "generated_notifications" USING btree ("app_id","recipient_principal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_record_relations_unique" ON "generated_record_relations" USING btree ("relation_id","from_record_id","to_record_id");--> statement-breakpoint
CREATE INDEX "generated_record_relations_app_id_idx" ON "generated_record_relations" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "generated_record_relations_to_record_idx" ON "generated_record_relations" USING btree ("to_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_record_revisions_record_revision_unique" ON "generated_record_revisions" USING btree ("record_id","revision");--> statement-breakpoint
CREATE INDEX "generated_record_revisions_app_id_idx" ON "generated_record_revisions" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "generated_records_app_entity_idx" ON "generated_records" USING btree ("app_id","entity_id");--> statement-breakpoint
CREATE INDEX "generated_records_app_entity_status_idx" ON "generated_records" USING btree ("app_id","entity_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_row_access_rules_unique" ON "generated_row_access_rules" USING btree ("app_id","entity_id","role_id","verb");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_uniqueness_claims_unique" ON "generated_uniqueness_claims" USING btree ("app_id","entity_id","field_id","value_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_workflow_executions_idempotency_unique" ON "generated_workflow_executions" USING btree ("app_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "generated_workflow_executions_app_id_idx" ON "generated_workflow_executions" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_workflow_step_executions_unique" ON "generated_workflow_step_executions" USING btree ("execution_id","step_id");