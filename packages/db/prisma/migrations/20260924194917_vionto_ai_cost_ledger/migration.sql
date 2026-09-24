-- AlterTable
ALTER TABLE "ViontoExport" ADD COLUMN     "costSnapshotAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ViontoAiCostEvent" (
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
    "projectId" TEXT,
    "versionId" TEXT,
    "renderJobId" TEXT,
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

    CONSTRAINT "ViontoAiCostEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViontoExportCostEvent" (
    "exportId" TEXT NOT NULL,
    "costEventId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ViontoExportCostEvent_pkey" PRIMARY KEY ("exportId","costEventId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ViontoAiCostEvent_idempotencyKey_key" ON "ViontoAiCostEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ViontoAiCostEvent_userId_occurredAt_id_idx" ON "ViontoAiCostEvent"("userId", "occurredAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ViontoAiCostEvent_projectId_idx" ON "ViontoAiCostEvent"("projectId");

-- CreateIndex
CREATE INDEX "ViontoAiCostEvent_subjectType_subjectId_idx" ON "ViontoAiCostEvent"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "ViontoAiCostEvent_workflowId_idx" ON "ViontoAiCostEvent"("workflowId");

-- CreateIndex
CREATE INDEX "ViontoExportCostEvent_costEventId_idx" ON "ViontoExportCostEvent"("costEventId");

-- AddForeignKey
ALTER TABLE "ViontoAiCostEvent" ADD CONSTRAINT "ViontoAiCostEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViontoExportCostEvent" ADD CONSTRAINT "ViontoExportCostEvent_exportId_fkey" FOREIGN KEY ("exportId") REFERENCES "ViontoExport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViontoExportCostEvent" ADD CONSTRAINT "ViontoExportCostEvent_costEventId_fkey" FOREIGN KEY ("costEventId") REFERENCES "ViontoAiCostEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Contract invariants (ADR 0003), enforced by the database itself ─────
ALTER TABLE "ViontoAiCostEvent" ADD CONSTRAINT "ViontoAiCostEvent_entry_type_check"
  CHECK ("entryType" IN ('usage', 'adjustment'));
ALTER TABLE "ViontoAiCostEvent" ADD CONSTRAINT "ViontoAiCostEvent_cost_source_check"
  CHECK ("costSource" IN ('provider_reported', 'registry_estimate', 'reconciled_adjustment', 'unknown'));
ALTER TABLE "ViontoAiCostEvent" ADD CONSTRAINT "ViontoAiCostEvent_credential_source_check"
  CHECK ("credentialSource" IN ('platform', 'user_byok', 'none'));
ALTER TABLE "ViontoAiCostEvent" ADD CONSTRAINT "ViontoAiCostEvent_unknown_has_no_amount_check"
  CHECK ("costSource" <> 'unknown' OR ("estimatedCostMicros" IS NULL AND "actualCostMicros" IS NULL));
ALTER TABLE "ViontoAiCostEvent" ADD CONSTRAINT "ViontoAiCostEvent_usage_amounts_non_negative_check"
  CHECK (COALESCE("estimatedCostMicros", 0) >= 0 AND COALESCE("actualCostMicros", 0) >= 0);
ALTER TABLE "ViontoAiCostEvent" ADD CONSTRAINT "ViontoAiCostEvent_adjustment_shape_check"
  CHECK (("entryType" = 'adjustment') = ("adjustmentDeltaMicros" IS NOT NULL AND "supersedesEventId" IS NOT NULL));

-- Append-only: inserted once, never modified. DELETE stays possible (user
-- cascade); UPDATE is refused outright. The export join is equally frozen.
CREATE OR REPLACE FUNCTION "vionto_cost_reject_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; write an adjustment row instead', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ViontoAiCostEvent_no_update"
  BEFORE UPDATE ON "ViontoAiCostEvent"
  FOR EACH ROW EXECUTE FUNCTION "vionto_cost_reject_update"();
CREATE TRIGGER "ViontoExportCostEvent_no_update"
  BEFORE UPDATE ON "ViontoExportCostEvent"
  FOR EACH ROW EXECUTE FUNCTION "vionto_cost_reject_update"();

-- ─── Backfill: history that already existed before this ledger ───────────
-- Same idempotency keys the runtime writes, so a clip that finishes after
-- this migration can never be recorded twice. Nothing is repriced:
--  * succeeded AI clips copy their generation-time snapshot (#352) —
--    registry_estimate when one was captured, otherwise unknown;
--  * AI-written scripts had no price snapshot at the time, so they are
--    recorded as UNKNOWN cost with their real token counts (partially
--    tracked), never estimated retroactively from today's price table.
INSERT INTO "ViontoAiCostEvent" (
  "id", "idempotencyKey", "userId", "actorId", "operation", "subjectType", "subjectId",
  "parentSubjectType", "parentSubjectId", "projectId", "versionId", "provider", "requestModel",
  "responseModel", "usage", "estimatedCostMicros", "costSource", "credentialSource", "pricingSnapshot",
  "metadata", "occurredAt", "finalizedAt"
)
SELECT
  'vce_' || md5('vionto:ai_motion_clip:' || c."id"),
  'vionto:ai_motion_clip:' || c."id",
  c."userId", c."userId", 'ai_motion_clip', 'ai_clip', c."id",
  'project', c."projectId", c."projectId", c."versionId", c."provider", c."model", c."model",
  jsonb_build_array(jsonb_build_object('bucket', 'video_output', 'unit', 'seconds', 'quantity', c."durationSeconds")),
  CASE WHEN c."estimatedCostUsdMicros" IS NOT NULL AND c."pricingSnapshot" IS NOT NULL THEN c."estimatedCostUsdMicros" END,
  CASE WHEN c."estimatedCostUsdMicros" IS NOT NULL AND c."pricingSnapshot" IS NOT NULL THEN 'registry_estimate' ELSE 'unknown' END,
  CASE c."credentialSource" WHEN 'user' THEN 'user_byok' WHEN 'env' THEN 'platform' ELSE 'none' END,
  CASE WHEN c."estimatedCostUsdMicros" IS NOT NULL AND c."pricingSnapshot" IS NOT NULL THEN
    jsonb_build_object(
      'pricingVersion', 'vionto-clip-registry-legacy',
      'provider', c."provider",
      'model', c."model",
      'tier', NULL,
      'currency', 'USD',
      'rates', jsonb_build_array(jsonb_build_object(
        'bucket', 'video_output', 'unit', 'seconds',
        'rateMicros', (round(((c."pricingSnapshot"->>'amount')::numeric) * 1000000))::bigint::text,
        'per', '5'
      )),
      'legacyClipSnapshot', c."pricingSnapshot"
    )
  END,
  jsonb_build_object('backfilled', true),
  c."updatedAt", c."updatedAt"
FROM "ViontoAiClip" c
WHERE c."status" = 'succeeded'
ON CONFLICT ("idempotencyKey") DO NOTHING;

INSERT INTO "ViontoAiCostEvent" (
  "id", "idempotencyKey", "userId", "actorId", "operation", "subjectType", "subjectId",
  "parentSubjectType", "parentSubjectId", "projectId", "versionId", "provider", "requestModel",
  "responseModel", "promptVersion", "usage", "inputTokens", "outputTokens", "costSource",
  "credentialSource", "latencyMs", "metadata", "occurredAt"
)
SELECT
  'vce_' || md5('vionto:story:script_' || s."id"),
  'vionto:story:script_' || s."id",
  s."userId", s."userId", 'story', 'script', s."id",
  'project', s."projectId", s."projectId", s."versionId", s."provider", s."model", COALESCE(s."model", s."provider"),
  s."promptVersion",
  (
    CASE WHEN COALESCE(s."promptTokens", 0) > 0 THEN jsonb_build_array(jsonb_build_object('bucket', 'input', 'unit', 'tokens', 'quantity', s."promptTokens")) ELSE '[]'::jsonb END
    || CASE WHEN COALESCE(s."completionTokens", 0) > 0 THEN jsonb_build_array(jsonb_build_object('bucket', 'output', 'unit', 'tokens', 'quantity', s."completionTokens")) ELSE '[]'::jsonb END
  ),
  COALESCE(s."promptTokens", 0), COALESCE(s."completionTokens", 0),
  'unknown', 'platform', s."latencyMs",
  jsonb_build_object('backfilled', true),
  s."createdAt"
FROM "ViontoScript" s
WHERE s."provider" IN ('openai', 'anthropic')
ON CONFLICT ("idempotencyKey") DO NOTHING;
