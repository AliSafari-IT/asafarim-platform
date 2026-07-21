CREATE TYPE "public"."project_visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"base_url" text DEFAULT '' NOT NULL,
	"api_url" text DEFAULT '' NOT NULL,
	"visibility" "project_visibility" DEFAULT 'public' NOT NULL,
	"key_hash" text,
	"product_name" text,
	"company_name" text,
	"seeded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
