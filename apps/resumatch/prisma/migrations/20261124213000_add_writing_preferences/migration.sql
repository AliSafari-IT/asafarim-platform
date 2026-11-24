-- #931: saved writing preferences, one immutable row per save.
-- CreateTable
CREATE TABLE "writing_preference_revisions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "writing_preference_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "writing_preference_revisions_workspaceId_revisionNumber_key" ON "writing_preference_revisions"("workspaceId", "revisionNumber");

-- AddForeignKey
ALTER TABLE "writing_preference_revisions" ADD CONSTRAINT "writing_preference_revisions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
