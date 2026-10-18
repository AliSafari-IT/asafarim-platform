-- EduMatch AI cost ledger (#540): the platform AI cost-event contract
-- (@asafarim/ai-cost-ledger) for the AI tutor. Additive only, no backfill.

-- CreateTable
CREATE TABLE "EduAiCostEvent" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "entryType" TEXT NOT NULL DEFAULT 'usage',
    "userId" TEXT NOT NULL,
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

    CONSTRAINT "EduAiCostEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EduAiCostEvent_idempotencyKey_key" ON "EduAiCostEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "EduAiCostEvent_occurredAt_idx" ON "EduAiCostEvent"("occurredAt" DESC);

-- CreateIndex
CREATE INDEX "EduAiCostEvent_userId_occurredAt_id_idx" ON "EduAiCostEvent"("userId", "occurredAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "EduAiCostEvent_subjectType_subjectId_idx" ON "EduAiCostEvent"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "EduAiCostEvent_workflowId_idx" ON "EduAiCostEvent"("workflowId");

-- AddForeignKey
ALTER TABLE "EduAiCostEvent" ADD CONSTRAINT "EduAiCostEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Contract invariants, enforced by the database itself ───────────────
ALTER TABLE "EduAiCostEvent" ADD CONSTRAINT "EduAiCostEvent_entry_type_check"
  CHECK ("entryType" IN ('usage', 'adjustment'));
ALTER TABLE "EduAiCostEvent" ADD CONSTRAINT "EduAiCostEvent_cost_source_check"
  CHECK ("costSource" IN ('provider_reported', 'registry_estimate', 'reconciled_adjustment', 'unknown'));
ALTER TABLE "EduAiCostEvent" ADD CONSTRAINT "EduAiCostEvent_credential_source_check"
  CHECK ("credentialSource" IN ('platform', 'user_byok', 'none'));
ALTER TABLE "EduAiCostEvent" ADD CONSTRAINT "EduAiCostEvent_unknown_has_no_amount_check"
  CHECK ("costSource" <> 'unknown' OR ("estimatedCostMicros" IS NULL AND "actualCostMicros" IS NULL));
ALTER TABLE "EduAiCostEvent" ADD CONSTRAINT "EduAiCostEvent_usage_amounts_non_negative_check"
  CHECK (COALESCE("estimatedCostMicros", 0) >= 0 AND COALESCE("actualCostMicros", 0) >= 0);
ALTER TABLE "EduAiCostEvent" ADD CONSTRAINT "EduAiCostEvent_adjustment_shape_check"
  CHECK (("entryType" = 'adjustment') = ("adjustmentDeltaMicros" IS NOT NULL AND "supersedesEventId" IS NOT NULL));

-- Append-only: inserted once, never modified. DELETE stays possible (user
-- cascade). Reuses the generic reject function from the Vionto ledger
-- migration (it only names TG_TABLE_NAME).
CREATE TRIGGER "EduAiCostEvent_no_update"
  BEFORE UPDATE ON "EduAiCostEvent"
  FOR EACH ROW EXECUTE FUNCTION "vionto_cost_reject_update"();
