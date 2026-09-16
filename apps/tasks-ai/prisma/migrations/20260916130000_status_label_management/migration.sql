-- Issue #387: status/label CRUD requires two additive columns that were
-- missing from the already-modeled Status/Label tables.
--   status.isDefault  — marks the Todo/In Progress/Done rows seeded on
--                        workspace creation, so a brand-new workspace never
--                        shows an empty picker.
--   status.archivedAt — soft-delete for "archive a status" (owner/admin
--                        action); tasks already pointing at an archived
--                        status keep their statusId, they just stop showing
--                        up as a pick option.
--   label.archivedAt  — same soft-delete convention for labels.
ALTER TABLE "status" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "status" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "label" ADD COLUMN "archivedAt" TIMESTAMP(3);
