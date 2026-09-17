-- Issue #235: widen the AI proposal op allowlist with two "suggested, not
-- committed" columns. AI may record a suggestion for a human to promote
-- separately (a distinct action, not part of applying the proposal); it
-- still never writes the committed `statusId`/`dueDate` directly — that
-- ADR-0004 hard prohibition holds because these are separate columns.
ALTER TABLE "task" ADD COLUMN "suggestedStatusId" TEXT;
ALTER TABLE "task" ADD COLUMN "suggestedDueDate" TIMESTAMP(3);

ALTER TABLE "task" ADD CONSTRAINT "task_suggestedStatusId_fkey" FOREIGN KEY ("suggestedStatusId") REFERENCES "status"("id") ON DELETE SET NULL ON UPDATE CASCADE;
