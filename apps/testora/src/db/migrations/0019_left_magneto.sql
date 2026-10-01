CREATE TABLE "target_secrets" (
	"id" text PRIMARY KEY NOT NULL,
	"target_id" text NOT NULL,
	"name" text NOT NULL,
	"value_enc" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "target_secrets" ADD CONSTRAINT "target_secrets_target_id_target_environments_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."target_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "target_secrets_target_name_unique" ON "target_secrets" USING btree ("target_id","name");