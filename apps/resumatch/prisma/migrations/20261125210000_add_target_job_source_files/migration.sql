-- Tailor "Upload files": the names of the files an uploaded job was read
-- from (up to five), so a resumed draft still lists them. Additive and
-- nullable: other intake paths and older uploads keep NULL.
ALTER TABLE "target_jobs" ADD COLUMN "sourceFiles" JSONB;
