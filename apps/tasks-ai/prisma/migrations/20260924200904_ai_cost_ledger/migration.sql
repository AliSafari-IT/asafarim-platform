-- AlterTable
ALTER TABLE "ai_job" ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "targetTaskId" TEXT;

-- CreateTable
CREATE TABLE "ai_cost_events" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "entryType" TEXT NOT NULL DEFAULT 'usage',
    "workspaceId" TEXT NOT NULL,
    "actorId" TEXT,
    "operation" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'succeeded',
    "finality" TEXT NOT NULL DEFAULT 'provisional',
    "attribution" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "parentSubjectType" TEXT,
    "parentSubjectId" TEXT,
    "projectId" TEXT,
    "taskId" TEXT,
    "aiJobId" TEXT,
    "proposalId" TEXT,
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

    CONSTRAINT "ai_cost_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_job_task_links" (
    "aiJobId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_job_task_links_pkey" PRIMARY KEY ("aiJobId","taskId","role")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_cost_events_idempotencyKey_key" ON "ai_cost_events"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ai_cost_events_workspaceId_occurredAt_id_idx" ON "ai_cost_events"("workspaceId", "occurredAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ai_cost_events_workspaceId_projectId_idx" ON "ai_cost_events"("workspaceId", "projectId");

-- CreateIndex
CREATE INDEX "ai_cost_events_workspaceId_taskId_idx" ON "ai_cost_events"("workspaceId", "taskId");

-- CreateIndex
CREATE INDEX "ai_cost_events_aiJobId_idx" ON "ai_cost_events"("aiJobId");

-- CreateIndex
CREATE INDEX "ai_job_task_links_taskId_idx" ON "ai_job_task_links"("taskId");

-- CreateIndex
CREATE INDEX "ai_job_workspaceId_projectId_idx" ON "ai_job"("workspaceId", "projectId");

-- AddForeignKey
ALTER TABLE "ai_cost_events" ADD CONSTRAINT "ai_cost_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_job_task_links" ADD CONSTRAINT "ai_job_task_links_aiJobId_fkey" FOREIGN KEY ("aiJobId") REFERENCES "ai_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_job_task_links" ADD CONSTRAINT "ai_job_task_links_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Contract invariants (ADR 0003), enforced by the database itself ─────
ALTER TABLE "ai_cost_events" ADD CONSTRAINT "ai_cost_events_entry_type_check"
  CHECK ("entryType" IN ('usage', 'adjustment'));
ALTER TABLE "ai_cost_events" ADD CONSTRAINT "ai_cost_events_cost_source_check"
  CHECK ("costSource" IN ('provider_reported', 'registry_estimate', 'reconciled_adjustment', 'unknown'));
ALTER TABLE "ai_cost_events" ADD CONSTRAINT "ai_cost_events_credential_source_check"
  CHECK ("credentialSource" IN ('platform', 'user_byok', 'none'));
ALTER TABLE "ai_cost_events" ADD CONSTRAINT "ai_cost_events_attribution_check"
  CHECK ("attribution" IN ('task', 'project', 'workspace'));
ALTER TABLE "ai_cost_events" ADD CONSTRAINT "ai_cost_events_unknown_has_no_amount_check"
  CHECK ("costSource" <> 'unknown' OR ("estimatedCostMicros" IS NULL AND "actualCostMicros" IS NULL));
ALTER TABLE "ai_cost_events" ADD CONSTRAINT "ai_cost_events_usage_amounts_non_negative_check"
  CHECK (COALESCE("estimatedCostMicros", 0) >= 0 AND COALESCE("actualCostMicros", 0) >= 0);
ALTER TABLE "ai_cost_events" ADD CONSTRAINT "ai_cost_events_adjustment_shape_check"
  CHECK (("entryType" = 'adjustment') = ("adjustmentDeltaMicros" IS NOT NULL AND "supersedesEventId" IS NOT NULL));
-- Money is attributed once, at the job's scope: a task-level row names its
-- project and task, a project-level row names only its project.
ALTER TABLE "ai_cost_events" ADD CONSTRAINT "ai_cost_events_attribution_shape_check"
  CHECK (
    ("attribution" = 'task' AND "taskId" IS NOT NULL AND "projectId" IS NOT NULL)
    OR ("attribution" = 'project' AND "taskId" IS NULL AND "projectId" IS NOT NULL)
    OR ("attribution" = 'workspace' AND "taskId" IS NULL AND "projectId" IS NULL)
  );

-- Append-only: inserted once, never modified. DELETE stays possible
-- (workspace cascade); UPDATE is refused outright.
CREATE OR REPLACE FUNCTION "ai_cost_events_reject_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ai_cost_events is append-only; write an adjustment row instead'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ai_cost_events_no_update"
  BEFORE UPDATE ON "ai_cost_events"
  FOR EACH ROW EXECUTE FUNCTION "ai_cost_events_reject_update"();
