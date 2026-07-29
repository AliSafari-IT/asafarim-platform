CREATE TYPE "public"."conversation_attachment_failure_code" AS ENUM('size_mismatch', 'oversized', 'mime_mismatch', 'unsupported_format', 'malware_detected', 'scanner_unavailable', 'extraction_failed', 'worker_infrastructure_error');--> statement-breakpoint
CREATE TYPE "public"."conversation_attachment_status" AS ENUM('pending', 'uploaded', 'processing', 'ready', 'quarantined', 'failed', 'deleted');--> statement-breakpoint
CREATE TABLE "conversation_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"message_id" text,
	"uploaded_by_principal_id" text NOT NULL,
	"original_filename" text NOT NULL,
	"declared_mime_type" text NOT NULL,
	"declared_size_bytes" integer NOT NULL,
	"detected_mime_type" text,
	"actual_size_bytes" integer,
	"sha256" text,
	"storage_key" text NOT NULL,
	"thumbnail_storage_key" text,
	"status" "conversation_attachment_status" DEFAULT 'pending' NOT NULL,
	"extraction_kind" text,
	"extraction_version" text,
	"extracted_text" text,
	"page_count" integer,
	"width_px" integer,
	"height_px" integer,
	"failure_code" "conversation_attachment_failure_code",
	"failure_message" text,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "conversation_attachments" ADD CONSTRAINT "conversation_attachments_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_attachments" ADD CONSTRAINT "conversation_attachments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_attachments" ADD CONSTRAINT "conversation_attachments_message_id_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_attachments_storage_key_unique" ON "conversation_attachments" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_attachments_app_idempotency_unique" ON "conversation_attachments" USING btree ("app_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "conversation_attachments_app_id_idx" ON "conversation_attachments" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "conversation_attachments_conversation_id_idx" ON "conversation_attachments" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_attachments_message_id_idx" ON "conversation_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "conversation_attachments_status_created_at_idx" ON "conversation_attachments" USING btree ("status","created_at");