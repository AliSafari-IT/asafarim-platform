-- CreateTable
CREATE TABLE "WebToolCostEvent" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "entryType" TEXT NOT NULL DEFAULT 'usage',
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "actorId" TEXT,
    "operation" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'succeeded',
    "finality" TEXT NOT NULL DEFAULT 'provisional',
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "parentSubjectType" TEXT,
    "parentSubjectId" TEXT,
    "workflowId" TEXT,
    "traceId" TEXT,
    "provider" TEXT NOT NULL,
    "requestModel" TEXT,
    "responseModel" TEXT NOT NULL,
    "providerRequestId" TEXT,
    "promptVersion" TEXT,
    "pricingTier" TEXT,
    "usage" JSONB NOT NULL DEFAULT '[]',
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "estimatedCostMicros" BIGINT,
    "actualCostMicros" BIGINT,
    "adjustmentDeltaMicros" BIGINT,
    "costSource" TEXT NOT NULL,
    "credentialSource" TEXT NOT NULL,
    "pricingSnapshot" JSONB,
    "fixture" BOOLEAN NOT NULL DEFAULT false,
    "supersedesEventId" TEXT,
    "latencyMs" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebToolCostEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebToolCostEvent_idempotencyKey_key" ON "WebToolCostEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WebToolCostEvent_occurredAt_idx" ON "WebToolCostEvent"("occurredAt" DESC);

-- CreateIndex
CREATE INDEX "WebToolCostEvent_operation_occurredAt_idx" ON "WebToolCostEvent"("operation", "occurredAt" DESC);

ALTER TABLE "WebToolCostEvent" ADD CONSTRAINT "WebToolCostEvent_unknown_has_no_amount_check"
  CHECK ("costSource" <> 'unknown' OR ("estimatedCostMicros" IS NULL AND "actualCostMicros" IS NULL));
ALTER TABLE "WebToolCostEvent" ADD CONSTRAINT "WebToolCostEvent_usage_amounts_non_negative_check"
  CHECK (COALESCE("estimatedCostMicros", 0) >= 0 AND COALESCE("actualCostMicros", 0) >= 0);
ALTER TABLE "WebToolCostEvent" ADD CONSTRAINT "WebToolCostEvent_adjustment_shape_check"
  CHECK (("entryType" = 'adjustment') = ("adjustmentDeltaMicros" IS NOT NULL AND "supersedesEventId" IS NOT NULL));

-- Append-only: inserted once, never modified. Reuses the generic reject
-- function from the Vionto ledger migration (it only names TG_TABLE_NAME).
CREATE TRIGGER "WebToolCostEvent_no_update"
  BEFORE UPDATE ON "WebToolCostEvent"
  FOR EACH ROW EXECUTE FUNCTION "vionto_cost_reject_update"();
