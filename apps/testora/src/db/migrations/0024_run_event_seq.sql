ALTER TABLE "runs" ADD COLUMN "event_seq" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- #740: start each run's counter at its current last event, so the next
-- append continues at max(seq) + 1.
UPDATE "runs" r SET "event_seq" = e.max_seq
  FROM (SELECT "run_id", max("seq") AS max_seq FROM "run_events" GROUP BY "run_id") e
 WHERE e."run_id" = r."id";
