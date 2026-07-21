CREATE TABLE "target_environments" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text DEFAULT 'webapp' NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"api_url" text NOT NULL,
	"seeded" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
