-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('free', 'pro', 'business', 'enterprise');

-- CreateEnum
CREATE TYPE "SubStatus" AS ENUM ('trialing', 'active', 'past_due', 'grace', 'canceled');

-- CreateTable
CREATE TABLE "subscription" (
    "workspaceId" TEXT NOT NULL,
    "tier" "PlanTier" NOT NULL DEFAULT 'free',
    "status" "SubStatus" NOT NULL DEFAULT 'active',
    "seats" INTEGER NOT NULL DEFAULT 3,
    "stripeCustomerId" TEXT,
    "stripeSubId" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "graceEndsAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "usage_meter" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "meter" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "included" INTEGER NOT NULL,
    "topUp" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_meter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "stripeInvoiceId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "status" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "hostedUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_event" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "workspaceId" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "redeemedBy" TEXT,
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usage_meter_workspaceId_meter_idx" ON "usage_meter"("workspaceId", "meter");

-- CreateIndex
CREATE UNIQUE INDEX "usage_meter_workspaceId_meter_periodStart_key" ON "usage_meter"("workspaceId", "meter", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_stripeInvoiceId_key" ON "invoice"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "invoice_workspaceId_createdAt_idx" ON "invoice"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "referral_code_key" ON "referral"("code");
