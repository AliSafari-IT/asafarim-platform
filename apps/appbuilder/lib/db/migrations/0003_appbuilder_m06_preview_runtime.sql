ALTER TABLE "preview_builds" ADD COLUMN "checksum" text;--> statement-breakpoint
ALTER TABLE "preview_builds" ADD COLUMN "registry_version" text;--> statement-breakpoint
ALTER TABLE "preview_builds" ADD COLUMN "diagnostics" jsonb;--> statement-breakpoint
ALTER TABLE "specifications" ADD COLUMN "pinned_preview_build_id" text;--> statement-breakpoint
ALTER TABLE "specifications" ADD CONSTRAINT "specifications_pinned_preview_build_id_preview_builds_id_fk" FOREIGN KEY ("pinned_preview_build_id") REFERENCES "public"."preview_builds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "preview_builds_version_registry_unique" ON "preview_builds" USING btree ("specification_version_id","registry_version");