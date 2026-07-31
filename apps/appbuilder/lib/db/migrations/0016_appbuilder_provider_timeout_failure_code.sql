-- #64 — `provider_timeout`, distinct from `provider_unavailable`.
--
-- Additive only: three new enum values, no rewrites and no backfill. Rows
-- written before this migration keep `provider_unavailable`; that is correct,
-- since we cannot retroactively tell which of them were really timeouts.
--
-- `ALTER TYPE ... ADD VALUE` is allowed inside a transaction from PostgreSQL
-- 12 onward provided the new value is not USED in the same transaction. This
-- migration only declares the values — the first row to carry one is written
-- by application code long after this commits — so it is safe under the
-- transactional migration runner (lib/db/migrate.ts).
--
-- IF NOT EXISTS keeps this idempotent, matching every other migration here.

ALTER TYPE "generation_job_failure_code" ADD VALUE IF NOT EXISTS 'provider_timeout';
--> statement-breakpoint
ALTER TYPE "modification_job_failure_code" ADD VALUE IF NOT EXISTS 'provider_timeout';
--> statement-breakpoint
ALTER TYPE "repair_job_failure_code" ADD VALUE IF NOT EXISTS 'provider_timeout';
