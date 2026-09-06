-- CreateTable
CREATE TABLE "proposal_feedback" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "editDistance" DOUBLE PRECISION,
    "timeSavedMin" INTEGER,
    "correctionReason" TEXT,
    "trust" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposal_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proposal_feedback_workspaceId_createdAt_idx" ON "proposal_feedback"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "proposal_feedback_proposalId_idx" ON "proposal_feedback"("proposalId");
