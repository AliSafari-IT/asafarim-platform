-- Capture + Inbox triage (issue #366).
--
-- Additive and backward compatible:
--   * task."triagedAt" is nullable; NULL means "captured, not yet organized",
--     which is the whole Inbox rule (lib/capture/inbox.ts).
--   * every pre-existing task is backfilled as already triaged, so turning
--     this on does not dump the entire workspace into the Inbox.
--   * project."isInbox" marks the workspace-level Inbox container, created
--     on demand so capture never has to silently pick somebody's project.

-- AlterTable
ALTER TABLE "task" ADD COLUMN "triagedAt" TIMESTAMP(3);

-- Backfill: work that existed before triage semantics is organized already.
UPDATE "task" SET "triagedAt" = "createdAt" WHERE "triagedAt" IS NULL;

-- AlterTable
ALTER TABLE "project" ADD COLUMN "isInbox" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "task_workspaceId_triagedAt_idx" ON "task"("workspaceId", "triagedAt");
