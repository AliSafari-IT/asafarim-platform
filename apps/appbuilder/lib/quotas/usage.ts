import { and, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  apps,
  deployments,
  generatedFiles,
  generatedWorkflowExecutions,
  previewBuilds,
  specificationVersions,
  usageEvents,
  validationRuns,
} from "../db/schema";
import { generationJobs } from "../db/schema";

/**
 * Every "current usage" counter a quota check or the readiness UI needs,
 * always re-derived from persisted rows — never a separately maintained
 * running counter that could drift from reality. Terminal-status sets
 * mirror each subsystem's own state machine so "active"/"concurrent" here
 * means exactly what that subsystem's worker means by it.
 */

const TERMINAL_GENERATION_JOB_STATUSES = [
  "ready",
  "failed",
  "cancelled",
] as const;
const TERMINAL_VALIDATION_RUN_STATUSES = [
  "passed",
  "failed",
  "infrastructure_error",
  "flaky",
  "cancelled",
] as const;
const TERMINAL_DEPLOYMENT_STATUSES = [
  "succeeded",
  "failed",
  "cancelled",
  "rolled_back",
] as const;

function startOfUtcDay(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

export async function countActiveAppsForOwner(
  db: Db,
  ownerPrincipalId: string
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(apps)
    .where(
      and(
        eq(apps.ownerPrincipalId, ownerPrincipalId),
        eq(apps.status, "active")
      )
    );
  return row?.count ?? 0;
}

export async function countActiveGenerationJobsForApp(
  db: Db,
  appId: string
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.appId, appId),
        notInArray(generationJobs.status, [...TERMINAL_GENERATION_JOB_STATUSES])
      )
    );
  return row?.count ?? 0;
}

export async function countAiRequestsTodayForOwner(
  db: Db,
  ownerPrincipalId: string
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.ownerPrincipalId, ownerPrincipalId),
        inArray(usageEvents.kind, [
          "ai_generation_request",
          "ai_modification_request",
          "ai_repair_request",
        ]),
        gte(usageEvents.occurredAt, startOfUtcDay())
      )
    );
  return row?.count ?? 0;
}

export async function countSpecificationVersionsForApp(
  db: Db,
  appId: string
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(specificationVersions)
    .where(eq(specificationVersions.appId, appId));
  return row?.count ?? 0;
}

export async function countPreviewBuildsForApp(
  db: Db,
  appId: string
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(previewBuilds)
    .where(eq(previewBuilds.appId, appId));
  return row?.count ?? 0;
}

/** Sums committed (non-archived) generated-file bytes across BOTH environments — one storage cap per app, not per environment. */
export async function sumStorageBytesForApp(
  db: Db,
  appId: string
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${generatedFiles.sizeBytes}), 0)::bigint`,
    })
    .from(generatedFiles)
    .where(
      and(
        eq(generatedFiles.appId, appId),
        eq(generatedFiles.status, "committed")
      )
    );
  return Number(row?.total ?? 0);
}

export async function countWorkflowExecutionsTodayForApp(
  db: Db,
  appId: string
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(generatedWorkflowExecutions)
    .where(
      and(
        eq(generatedWorkflowExecutions.appId, appId),
        gte(generatedWorkflowExecutions.createdAt, startOfUtcDay())
      )
    );
  return row?.count ?? 0;
}

export async function countConcurrentDeploymentJobsForApp(
  db: Db,
  appId: string
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(deployments)
    .where(
      and(
        eq(deployments.appId, appId),
        notInArray(deployments.status, [...TERMINAL_DEPLOYMENT_STATUSES])
      )
    );
  return row?.count ?? 0;
}

export async function countConcurrentValidationJobsForApp(
  db: Db,
  appId: string
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(validationRuns)
    .where(
      and(
        eq(validationRuns.appId, appId),
        notInArray(validationRuns.status, [...TERMINAL_VALIDATION_RUN_STATUSES])
      )
    );
  return row?.count ?? 0;
}
