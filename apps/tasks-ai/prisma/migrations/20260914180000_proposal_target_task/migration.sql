-- PR #377 review: a task-scoped draft ("break this down", "draft acceptance
-- criteria") had no way to name the task it was launched from. Refs are
-- proposal-local, so decomposition parented subtasks under a task the
-- proposal itself created and an acceptance-criteria update addressed an id
-- that did not exist — applied as nothing while review claimed an edit.
-- The job now records that task here; apply resolves the reserved
-- TARGET_TASK_REF against it and refuses updates to anything else.
-- Nullable and additive: existing rows stay free-text drafts.
ALTER TABLE "proposal" ADD COLUMN "targetTaskId" TEXT;
