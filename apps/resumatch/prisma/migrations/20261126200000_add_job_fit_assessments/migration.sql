-- #971: evidence-based job fit assessments, clarification answers and
-- requirement corrections. Additive: new tables only.
CREATE TABLE "job_fit_assessments" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "targetJobId" TEXT NOT NULL,
    "profileVersionId" TEXT NOT NULL,
    "inputFingerprint" TEXT NOT NULL,
    "jobFingerprint" TEXT NOT NULL,
    "evidenceRevisionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "method" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "contractVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "analysis" JSONB NOT NULL,
    "score" JSONB,
    "scoredAt" TIMESTAMP(3),
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_fit_assessments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "job_fit_assessments_workspaceId_inputFingerprint_key" ON "job_fit_assessments"("workspaceId", "inputFingerprint");
CREATE INDEX "job_fit_assessments_workspaceId_targetJobId_createdAt_idx" ON "job_fit_assessments"("workspaceId", "targetJobId", "createdAt");

ALTER TABLE "job_fit_assessments" ADD CONSTRAINT "job_fit_assessments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_fit_assessments" ADD CONSTRAINT "job_fit_assessments_targetJobId_fkey" FOREIGN KEY ("targetJobId") REFERENCES "target_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "job_fit_answers" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "targetJobId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "evidenceRevisionId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_fit_answers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "job_fit_answers_workspaceId_targetJobId_idx" ON "job_fit_answers"("workspaceId", "targetJobId");

ALTER TABLE "job_fit_answers" ADD CONSTRAINT "job_fit_answers_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_fit_answers" ADD CONSTRAINT "job_fit_answers_targetJobId_fkey" FOREIGN KEY ("targetJobId") REFERENCES "target_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "job_fit_corrections" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "targetJobId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "priority" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_fit_corrections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "job_fit_corrections_workspaceId_targetJobId_idx" ON "job_fit_corrections"("workspaceId", "targetJobId");

ALTER TABLE "job_fit_corrections" ADD CONSTRAINT "job_fit_corrections_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_fit_corrections" ADD CONSTRAINT "job_fit_corrections_targetJobId_fkey" FOREIGN KEY ("targetJobId") REFERENCES "target_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
