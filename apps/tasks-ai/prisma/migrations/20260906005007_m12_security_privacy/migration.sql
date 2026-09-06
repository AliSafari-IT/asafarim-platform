-- CreateEnum
CREATE TYPE "DsrKind" AS ENUM ('export', 'delete');

-- CreateEnum
CREATE TYPE "DsrState" AS ENUM ('requested', 'processing', 'completed', 'failed');

-- CreateTable
CREATE TABLE "data_subject_request" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "kind" "DsrKind" NOT NULL,
    "state" "DsrState" NOT NULL DEFAULT 'requested',
    "manifest" JSONB NOT NULL DEFAULT '{}',
    "verification" JSONB NOT NULL DEFAULT '{}',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_subject_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "break_glass_grant" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "grantedTo" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "ticketRef" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "break_glass_grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_counter" (
    "id" TEXT NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowEnd" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_counter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_subject_request_workspaceId_state_idx" ON "data_subject_request"("workspaceId", "state");

-- CreateIndex
CREATE INDEX "break_glass_grant_workspaceId_expiresAt_idx" ON "break_glass_grant"("workspaceId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "rate_counter_bucketKey_key" ON "rate_counter"("bucketKey");

-- CreateIndex
CREATE INDEX "rate_counter_windowEnd_idx" ON "rate_counter"("windowEnd");
