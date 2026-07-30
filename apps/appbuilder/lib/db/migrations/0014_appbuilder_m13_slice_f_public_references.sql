CREATE TYPE "public"."conversation_reference_adapter" AS ENUM('generic_https', 'github_profile', 'github_repository');--> statement-breakpoint
CREATE TYPE "public"."conversation_reference_failure_code" AS ENUM('url_not_allowed', 'too_many_redirects', 'timeout', 'too_large', 'unsupported_content_type', 'fetch_failed', 'rate_limited', 'no_content');--> statement-breakpoint
CREATE TYPE "public"."conversation_reference_status" AS ENUM('ready', 'unavailable', 'deleted');--> statement-breakpoint
ALTER TYPE "public"."usage_event_kind" ADD VALUE 'public_reference_fetch';--> statement-breakpoint
CREATE TABLE "conversation_references" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"imported_by_principal_id" text NOT NULL,
	"source_url" text NOT NULL,
	"final_url" text,
	"host" text NOT NULL,
	"adapter" "conversation_reference_adapter" NOT NULL,
	"adapter_version" text NOT NULL,
	"status" "conversation_reference_status" DEFAULT 'unavailable' NOT NULL,
	"title" text,
	"content_type" text,
	"extracted_text" text,
	"facts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_hash" text,
	"original_chars" integer,
	"truncated" boolean DEFAULT false NOT NULL,
	"fetched_at" timestamp with time zone,
	"cache_expires_at" timestamp with time zone,
	"refresh_count" integer DEFAULT 0 NOT NULL,
	"failure_code" "conversation_reference_failure_code",
	"failure_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "conversation_references" ADD CONSTRAINT "conversation_references_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_references" ADD CONSTRAINT "conversation_references_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_references_app_source_url_unique" ON "conversation_references" USING btree ("app_id","source_url");--> statement-breakpoint
CREATE INDEX "conversation_references_app_id_idx" ON "conversation_references" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "conversation_references_conversation_id_idx" ON "conversation_references" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_references_status_fetched_at_idx" ON "conversation_references" USING btree ("status","fetched_at");