CREATE TABLE "run_events" (
	"run_id" text NOT NULL,
	"seq" integer NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_events_run_id_seq_pk" PRIMARY KEY("run_id","seq")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text,
	"owner_id" text,
	"owner_name" text,
	"target_id" text,
	"rate_key" text,
	"label" text,
	"status" text DEFAULT 'created' NOT NULL,
	"total" integer,
	"error" text,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"job_enc" text
);
--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "runs_status_queued_at_idx" ON "runs" USING btree ("status","queued_at");--> statement-breakpoint
CREATE INDEX "runs_owner_idx" ON "runs" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "runs_rate_key_idx" ON "runs" USING btree ("rate_key","queued_at");