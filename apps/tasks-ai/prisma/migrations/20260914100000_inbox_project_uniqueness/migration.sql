-- At most one Inbox container per workspace (issue #366 review follow-up).
--
-- `ensureInboxProjectFor` reads then creates, so two concurrent captures in a
-- workspace with no Inbox yet could each create one (INBOX and INBOX0) and
-- the workspace would end up with captures split across two containers.
-- The invariant belongs at the database boundary; the service now treats the
-- resulting unique violation as "somebody else created it" and re-reads.
--
-- Prisma cannot express a partial unique index, so this is raw SQL and has no
-- counterpart in schema.prisma (see the `isInbox` field comment there).

-- Collapse any duplicates that the pre-index window may have produced: the
-- oldest container wins, the rest become ordinary projects. No task moves —
-- they stay where they were captured and remain triageable.
UPDATE "project" p
SET "isInbox" = false
WHERE p."isInbox" = true
  AND EXISTS (
    SELECT 1
    FROM "project" q
    WHERE q."workspaceId" = p."workspaceId"
      AND q."isInbox" = true
      AND (q."createdAt" < p."createdAt" OR (q."createdAt" = p."createdAt" AND q."id" < p."id"))
  );

-- CreateIndex
CREATE UNIQUE INDEX "project_workspaceId_isInbox_key"
  ON "project" ("workspaceId")
  WHERE "isInbox" = true;
