CREATE TABLE "conversation_memories" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"specification_version_number" integer DEFAULT 0 NOT NULL,
	"references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assumptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preferences" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "modification_jobs" ADD COLUMN "context_manifest" jsonb;--> statement-breakpoint
ALTER TABLE "conversation_memories" ADD CONSTRAINT "conversation_memories_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_memories" ADD CONSTRAINT "conversation_memories_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_memories_conversation_id_unique" ON "conversation_memories" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_memories_app_id_idx" ON "conversation_memories" USING btree ("app_id");