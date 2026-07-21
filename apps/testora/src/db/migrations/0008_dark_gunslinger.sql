CREATE TYPE "public"."github_issue_state" AS ENUM('open', 'closed');--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "github_state" "github_issue_state";