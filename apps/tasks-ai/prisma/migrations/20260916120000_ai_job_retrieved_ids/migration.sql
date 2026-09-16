-- Issue #232: grounded context retrieval (RAG) for the copilot.
-- Records which retrieved entity ids ("task:<id>" | "comment:<id>" |
-- "project:<id>") a draft was grounded against, independent of which of
-- them the model actually cited, so a run is reproducible even after the
-- underlying data changes. Additive and defaulted: existing rows backfill
-- to an empty array (they predate retrieval and were grounded on nothing).
ALTER TABLE "ai_job" ADD COLUMN "retrievedIds" TEXT[] NOT NULL DEFAULT '{}';
