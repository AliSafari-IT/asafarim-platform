-- #929: confirmed background evidence. New tables only; nothing existing
-- changes, so every older row reads as before.
CREATE TYPE "EvidenceKind" AS ENUM ('PROJECT', 'ACHIEVEMENT', 'RESPONSIBILITY', 'MOTIVATION');
CREATE TYPE "EvidenceScope" AS ENUM ('APPLICATION', 'BACKGROUND');
CREATE TYPE "EvidenceStatus" AS ENUM ('DRAFT', 'CONFIRMED');

CREATE TABLE "candidate_evidence" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scope" "EvidenceScope" NOT NULL,
    "targetJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_evidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "candidate_evidence_revisions" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "kind" "EvidenceKind" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "experienceRef" JSONB,
    "status" "EvidenceStatus" NOT NULL DEFAULT 'DRAFT',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_evidence_revisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "candidate_evidence_workspaceId_scope_idx" ON "candidate_evidence"("workspaceId", "scope");
CREATE INDEX "candidate_evidence_workspaceId_targetJobId_idx" ON "candidate_evidence"("workspaceId", "targetJobId");
CREATE UNIQUE INDEX "candidate_evidence_revisions_evidenceId_revisionNumber_key" ON "candidate_evidence_revisions"("evidenceId", "revisionNumber");
CREATE INDEX "candidate_evidence_revisions_workspaceId_idx" ON "candidate_evidence_revisions"("workspaceId");

ALTER TABLE "candidate_evidence" ADD CONSTRAINT "candidate_evidence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "candidate_evidence" ADD CONSTRAINT "candidate_evidence_targetJobId_fkey" FOREIGN KEY ("targetJobId") REFERENCES "target_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "candidate_evidence_revisions" ADD CONSTRAINT "candidate_evidence_revisions_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "candidate_evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
