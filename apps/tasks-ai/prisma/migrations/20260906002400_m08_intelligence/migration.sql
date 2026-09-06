-- CreateTable
CREATE TABLE "signal_preference" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signal_preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signal_feedback" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signal_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "signal_preference_workspaceId_membershipId_signalType_key" ON "signal_preference"("workspaceId", "membershipId", "signalType");

-- CreateIndex
CREATE INDEX "signal_feedback_workspaceId_signalType_createdAt_idx" ON "signal_feedback"("workspaceId", "signalType", "createdAt");
