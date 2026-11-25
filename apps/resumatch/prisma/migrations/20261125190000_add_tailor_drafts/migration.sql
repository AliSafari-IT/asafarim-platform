-- Unfinished Tailor runs, resumable after leaving /tailor.
CREATE TABLE "tailor_drafts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "targetJobId" TEXT NOT NULL,
    "step" TEXT NOT NULL DEFAULT 'options',
    "options" JSONB,
    "previewId" TEXT,
    "review" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tailor_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tailor_drafts_targetJobId_key" ON "tailor_drafts"("targetJobId");
CREATE INDEX "tailor_drafts_workspaceId_updatedAt_idx" ON "tailor_drafts"("workspaceId", "updatedAt");
CREATE INDEX "tailor_drafts_updatedAt_idx" ON "tailor_drafts"("updatedAt");

ALTER TABLE "tailor_drafts" ADD CONSTRAINT "tailor_drafts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tailor_drafts" ADD CONSTRAINT "tailor_drafts_targetJobId_fkey" FOREIGN KEY ("targetJobId") REFERENCES "target_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
