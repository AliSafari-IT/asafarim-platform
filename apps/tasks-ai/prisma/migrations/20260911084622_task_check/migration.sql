-- CreateEnum
CREATE TYPE "TaskCheckState" AS ENUM ('pending', 'satisfied', 'failed');

-- CreateTable
CREATE TABLE "task_check" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "state" "TaskCheckState" NOT NULL DEFAULT 'pending',
    "evidenceUrl" TEXT,
    "externalRef" TEXT,
    "reason" TEXT,
    "overriddenAt" TIMESTAMP(3),
    "overriddenBy" TEXT,
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_check_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_check_workspaceId_taskId_idx" ON "task_check"("workspaceId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "task_check_externalRef_key" ON "task_check"("externalRef");

-- AddForeignKey
ALTER TABLE "task_check" ADD CONSTRAINT "task_check_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
