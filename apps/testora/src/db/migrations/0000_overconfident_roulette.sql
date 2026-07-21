CREATE TYPE "public"."script_type" AS ENUM('single', 'multi');--> statement-breakpoint
CREATE TYPE "public"."test_status" AS ENUM('pending', 'running', 'passed', 'failed', 'error');--> statement-breakpoint
CREATE TABLE "functional_requirements" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_cases" (
	"case_id" text PRIMARY KEY NOT NULL,
	"fixture_id" text NOT NULL,
	"title" text NOT NULL,
	"script_type" "script_type" DEFAULT 'single' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb,
	"runs" jsonb DEFAULT '[]'::jsonb,
	"expected" jsonb DEFAULT '{}'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_fixtures" (
	"fixture_id" text PRIMARY KEY NOT NULL,
	"suite_id" text NOT NULL,
	"title" text NOT NULL,
	"base_url" text,
	"common_input" jsonb DEFAULT '{}'::jsonb,
	"setup_script" text,
	"teardown_script" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_results" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"status" "test_status" DEFAULT 'pending' NOT NULL,
	"run_index" integer,
	"duration_ms" integer,
	"details" jsonb DEFAULT '{}'::jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_suites" (
	"suite_id" text PRIMARY KEY NOT NULL,
	"fr_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_fixture_id_test_fixtures_fixture_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."test_fixtures"("fixture_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_fixtures" ADD CONSTRAINT "test_fixtures_suite_id_test_suites_suite_id_fk" FOREIGN KEY ("suite_id") REFERENCES "public"."test_suites"("suite_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_case_id_test_cases_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."test_cases"("case_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_suites" ADD CONSTRAINT "test_suites_fr_id_functional_requirements_id_fk" FOREIGN KEY ("fr_id") REFERENCES "public"."functional_requirements"("id") ON DELETE cascade ON UPDATE no action;