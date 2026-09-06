-- TasksAI M05 search indexes. Applied out-of-band (deploy step / manual),
-- NOT a Prisma migration: they are expression / extension indexes Prisma's
-- schema language cannot express, and putting them in a tracked migration
-- would permanently fail `prisma migrate diff` drift checks.
-- The global-search service works without them; they make it fast at scale.
CREATE INDEX IF NOT EXISTS "task_fts_idx"
  ON "task" USING GIN (to_tsvector('english', coalesce("title",'') || ' ' || coalesce("description",'')));
CREATE INDEX IF NOT EXISTS "comment_fts_idx"
  ON "comment" USING GIN (to_tsvector('english', coalesce("body",'')));
CREATE INDEX IF NOT EXISTS "project_fts_idx"
  ON "project" USING GIN (to_tsvector('english', coalesce("name",'') || ' ' || coalesce("description",'')));
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "label_name_trgm_idx" ON "label" USING GIN ("name" gin_trgm_ops);
