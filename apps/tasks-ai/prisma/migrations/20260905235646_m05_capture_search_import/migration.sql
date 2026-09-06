-- CreateEnum
CREATE TYPE "ImportKind" AS ENUM ('csv', 'json');

-- CreateEnum
CREATE TYPE "ImportState" AS ENUM ('validating', 'dry_run_ready', 'applying', 'completed', 'failed');

-- CreateTable
CREATE TABLE "saved_search" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "filters" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_search_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_history" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_job" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "kind" "ImportKind" NOT NULL,
    "filename" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "state" "ImportState" NOT NULL DEFAULT 'validating',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "appliedRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "rows" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_address" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "localPart" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_message" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "taskId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_search_workspaceId_membershipId_idx" ON "saved_search"("workspaceId", "membershipId");

-- CreateIndex
CREATE INDEX "search_history_workspaceId_membershipId_ranAt_idx" ON "search_history"("workspaceId", "membershipId", "ranAt");

-- CreateIndex
CREATE INDEX "import_job_workspaceId_state_idx" ON "import_job"("workspaceId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_address_workspaceId_key" ON "inbound_address"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_address_localPart_key" ON "inbound_address"("localPart");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_message_workspaceId_messageId_key" ON "inbound_message"("workspaceId", "messageId");
