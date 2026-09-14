-- Narrow the Inbox uniqueness index to *active* Inbox containers (PR #374
-- review follow-up to 20260914100000_inbox_project_uniqueness).
--
-- `findInbox` looks for `isInbox = true AND "archivedAt" IS NULL`, but the
-- index it relies on covered archived rows too. Nothing stops an owner from
-- archiving the Inbox project, and that left the workspace wedged: the
-- lookup no longer saw a container, so `ensureInboxProjectFor` tried to
-- create one, and the index rejected every candidate key against the
-- archived row. Capture-without-a-project then failed permanently with
-- conflict_unique.
--
-- Aligning the predicate with the lookup means an archived Inbox simply
-- stops being the workspace's Inbox: the next capture creates a fresh
-- container, and the archived row keeps its history. "At most one *active*
-- Inbox per workspace" — the invariant the service actually depends on —
-- is still enforced by the database.

-- An archived container is not the workspace's Inbox as far as the service
-- is concerned, so stop claiming it is. This also keeps a future "restore
-- project" path from resurrecting a second Inbox into the narrowed index.
-- No task moves — they stay where they were captured.
UPDATE "project" p
SET "isInbox" = false
WHERE p."isInbox" = true
  AND p."archivedAt" IS NOT NULL;

DROP INDEX IF EXISTS "project_workspaceId_isInbox_key";

CREATE UNIQUE INDEX "project_workspaceId_isInbox_key"
  ON "project" ("workspaceId")
  WHERE "isInbox" = true AND "archivedAt" IS NULL;
