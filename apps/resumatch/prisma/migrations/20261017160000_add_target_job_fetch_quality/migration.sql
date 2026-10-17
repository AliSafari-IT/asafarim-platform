-- #520: fetch-quality signal on a fetched job posting. Additive: existing rows
-- keep NULL ("not assessed") and an empty reason list, which renders as today.
ALTER TABLE "target_jobs" ADD COLUMN "fetchLooksIncomplete" BOOLEAN;
ALTER TABLE "target_jobs" ADD COLUMN "fetchQualityReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
