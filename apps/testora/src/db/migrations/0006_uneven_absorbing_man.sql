ALTER TABLE "functional_requirements" ALTER COLUMN "project_id" SET DEFAULT 'immostory';--> statement-breakpoint
ALTER TABLE "target_environments" ALTER COLUMN "project_id" SET DEFAULT 'immostory';--> statement-breakpoint
-- Consolidate the legacy generic "webapp" app into "immostory": move its catalog
-- and any user-created targets onto immostory, drop the legacy seeded targets, and
-- collapse the app row (rename if immostory doesn't exist yet, else delete webapp).
DO $$
BEGIN
  UPDATE functional_requirements SET project_id = 'immostory' WHERE project_id = 'webapp';
  UPDATE target_environments SET project_id = 'immostory' WHERE project_id = 'webapp' AND seeded = false;
  DELETE FROM target_environments WHERE project_id = 'webapp';
  IF EXISTS (SELECT 1 FROM projects WHERE id = 'webapp') THEN
    IF NOT EXISTS (SELECT 1 FROM projects WHERE id = 'immostory') THEN
      UPDATE projects SET id = 'immostory' WHERE id = 'webapp';
    ELSE
      DELETE FROM projects WHERE id = 'webapp';
    END IF;
  END IF;
END $$;