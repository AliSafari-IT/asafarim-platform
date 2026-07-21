CREATE TYPE "public"."app_visibility" AS ENUM('private', 'team');--> statement-breakpoint
CREATE TYPE "public"."starter_family" AS ENUM('blank', 'task_management', 'crm', 'inventory', 'booking');--> statement-breakpoint
CREATE TABLE "creation_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"requested_by_principal_id" text NOT NULL,
	"prompt" text NOT NULL,
	"starter_family" "starter_family" NOT NULL,
	"visibility" "app_visibility" DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "visibility" "app_visibility" DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "creation_requests" ADD CONSTRAINT "creation_requests_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "creation_requests_app_id_unique" ON "creation_requests" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "apps_status_idx" ON "apps" USING btree ("status");--> statement-breakpoint
CREATE INDEX "apps_updated_at_idx" ON "apps" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "apps_created_at_idx" ON "apps" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "apps_name_idx" ON "apps" USING btree ("name");