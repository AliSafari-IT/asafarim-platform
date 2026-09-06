-- CreateEnum
CREATE TYPE "FeedbackSeverity" AS ENUM ('blocker', 'major', 'minor', 'idea');

-- CreateEnum
CREATE TYPE "FeedbackState" AS ENUM ('triage', 'accepted', 'in_progress', 'resolved', 'wont_do');

-- CreateTable
CREATE TABLE "beta_consent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beta_consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beta_enrollment" (
    "workspaceId" TEXT NOT NULL,
    "cohort" TEXT NOT NULL,
    "teamType" TEXT,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "segment" TEXT,
    "decision" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "beta_enrollment_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "feedback_item" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "reportedBy" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "severity" "FeedbackSeverity" NOT NULL,
    "state" "FeedbackState" NOT NULL DEFAULT 'triage',
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "ownerId" TEXT,
    "respondBy" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "linkedChange" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "beta_consent_workspaceId_membershipId_termsVersion_key" ON "beta_consent"("workspaceId", "membershipId", "termsVersion");

-- CreateIndex
CREATE INDEX "feedback_item_workspaceId_state_severity_idx" ON "feedback_item"("workspaceId", "state", "severity");

-- CreateIndex
CREATE INDEX "feedback_item_workspaceId_respondBy_idx" ON "feedback_item"("workspaceId", "respondBy");
