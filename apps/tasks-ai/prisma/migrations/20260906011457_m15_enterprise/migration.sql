-- CreateTable
CREATE TABLE "domain_claim" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "verifyToken" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "autoJoin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_account" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenId" TEXT,
    "ipAllowlist" TEXT[],
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_policy" (
    "workspaceId" TEXT NOT NULL,
    "activityDays" INTEGER,
    "auditDays" INTEGER,
    "outboxDays" INTEGER,
    "notificationDays" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_policy_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "legal_hold" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "placedBy" TEXT NOT NULL,
    "liftedAt" TIMESTAMP(3),
    "liftedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_hold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_stream" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "cursor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_stream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scim_event" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "op" TEXT NOT NULL,
    "membershipId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scim_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "domain_claim_domain_key" ON "domain_claim"("domain");

-- CreateIndex
CREATE INDEX "domain_claim_workspaceId_idx" ON "domain_claim"("workspaceId");

-- CreateIndex
CREATE INDEX "service_account_workspaceId_idx" ON "service_account"("workspaceId");

-- CreateIndex
CREATE INDEX "legal_hold_workspaceId_liftedAt_idx" ON "legal_hold"("workspaceId", "liftedAt");

-- CreateIndex
CREATE UNIQUE INDEX "audit_stream_workspaceId_key" ON "audit_stream"("workspaceId");

-- CreateIndex
CREATE INDEX "scim_event_workspaceId_idx" ON "scim_event"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "scim_event_workspaceId_externalId_op_receivedAt_key" ON "scim_event"("workspaceId", "externalId", "op", "receivedAt");
