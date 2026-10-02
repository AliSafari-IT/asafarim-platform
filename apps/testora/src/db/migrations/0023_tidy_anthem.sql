CREATE TABLE "target_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"target_id" text NOT NULL,
	"project_id" text,
	"field" text NOT NULL,
	"from_origin" text,
	"to_origin" text,
	"secrets_action" text NOT NULL,
	"user_id" text,
	"user_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "target_changes_target_idx" ON "target_changes" USING btree ("target_id","created_at");