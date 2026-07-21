ALTER TABLE "applied_operations" ADD COLUMN "request_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "applied_operations" ADD COLUMN "base_version_number" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "specification_versions" ADD COLUMN "parent_version_id" text;--> statement-breakpoint
ALTER TABLE "specification_versions" ADD COLUMN "schema_version" text NOT NULL;--> statement-breakpoint
ALTER TABLE "specification_versions" ADD COLUMN "engine_version" text NOT NULL;--> statement-breakpoint
ALTER TABLE "specification_versions" ADD COLUMN "summary" text DEFAULT '' NOT NULL;