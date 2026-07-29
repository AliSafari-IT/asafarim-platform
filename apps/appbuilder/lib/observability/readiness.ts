import { and, desc, eq, lt, notInArray } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  appDomains,
  backupRuns,
  customDomainRequests,
  deployments,
  generationJobs,
  operationalEvents,
  previewBuilds,
  releases,
  restoreRehearsals,
  specifications,
  validationRuns,
} from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertCapability, type Role } from "../repositories/authz";
import {
  QUOTA_METRICS,
  QUOTA_METRIC_SCOPE,
  type QuotaMetric,
} from "../quotas/limits";
import { checkQuotaSnapshot } from "../quotas/enforce";
import {
  countActiveAppsForOwner,
  countActiveGenerationJobsForApp,
  countAiRequestsTodayForOwner,
  countAttachmentsForApp,
  countConcurrentDeploymentJobsForApp,
  countConcurrentValidationJobsForApp,
  countPreviewBuildsForApp,
  countSpecificationVersionsForApp,
  countWorkflowExecutionsTodayForApp,
  sumAttachmentBytesForApp,
  sumStorageBytesForApp,
} from "../quotas/usage";
import { isCustomDomainsEnabled } from "../customDomains/featureFlag";
import {
  getLatestBackupStatus,
  getLatestRestoreRehearsal,
} from "../backup/repository";
import type { ReadinessStatus } from "./status";

export type { ReadinessStatus } from "./status";

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
const TERMINAL_DEPLOYMENT_STATUSES_LOCAL = [
  "succeeded",
  "failed",
  "cancelled",
  "rolled_back",
] as const;

const QUOTA_METRIC_LABELS: Record<QuotaMetric, string> = {
  apps_per_owner: "Applications (per owner)",
  active_generation_jobs_per_app: "Active AI generation jobs",
  ai_requests_per_day_per_owner: "AI requests today (per owner)",
  specification_versions_per_app: "Specification versions",
  preview_builds_per_app: "Preview builds",
  storage_bytes_per_app: "Storage",
  workflow_executions_per_day_per_app: "Workflow executions today",
  concurrent_deployment_jobs_per_app: "Concurrent deployments",
  concurrent_validation_jobs_per_app: "Concurrent validation runs",
  attachment_bytes_per_app: "Conversation attachment storage",
  attachments_per_app: "Conversation attachments",
};

export interface QuotaSnapshotEntry {
  metric: QuotaMetric;
  label: string;
  scope: "owner" | "app";
  current: number;
  limit: number;
  exceeded: boolean;
}

export interface AppReadinessSnapshot {
  appId: string;
  generatedAt: string;
  role: Role;
  /** True when this response was intentionally trimmed for a viewer — see docstring on buildAppReadinessSnapshot. */
  restricted: boolean;

  versions: {
    draftVersionNumber: number;
    previewBuild: { id: string; status: string; createdAt: string } | null;
    approvedRelease: {
      id: string;
      versionLabel: string;
      approvedAt: string | null;
    } | null;
    productionRelease: {
      id: string;
      versionLabel: string;
      publishedAt: string | null;
      activatedAt: string | null;
    } | null;
  };

  validation: {
    status: ReadinessStatus;
    latestRun: {
      id: string;
      status: string;
      mandatoryGatesPassed: number;
      mandatoryGatesTotal: number;
      releaseEligible: boolean;
      createdAt: string;
    } | null;
  };

  deployment: {
    status: ReadinessStatus;
    activeDeployment: {
      id: string;
      status: string;
      phase: string;
      isRollback: boolean;
      createdAt: string;
    } | null;
    recentEvents: Array<{
      id: string;
      status: string;
      phase: string;
      isRollback: boolean;
      createdAt: string;
      activatedAt: string | null;
      failureMessage: string | null;
    }>;
  };

  /** null for a restricted (viewer) response — see docstring. */
  aiUsage: {
    requestsToday: number;
    limit: number;
    lastGenerationJob: { id: string; status: string; createdAt: string } | null;
  } | null;

  /** null for a restricted (viewer) response. */
  quotas: QuotaSnapshotEntry[] | null;

  /** null for a restricted (viewer) response. */
  storage: { usedBytes: number; limitBytes: number; exceeded: boolean } | null;

  /** null for a restricted (viewer) response. */
  workflows: { executionsToday: number; limit: number } | null;

  /** null for a restricted (viewer) response. */
  jobs: {
    active: Array<{
      kind: "generation" | "validation" | "deployment";
      id: string;
      status: string;
      createdAt: string;
    }>;
    stuck: Array<{
      kind: "generation" | "validation" | "deployment";
      id: string;
      status: string;
      leaseExpiresAt: string | null;
    }>;
  } | null;

  /** null for a restricted (viewer) response — backups are a platform-wide, not per-app, operational concern. */
  backup: {
    status: ReadinessStatus;
    lastBackup: {
      kind: string;
      status: string;
      completedAt: string | null;
      ageHours: number | null;
    } | null;
    lastRestoreRehearsal: {
      status: string;
      completedAt: string | null;
      verifiedCounts: Record<string, number> | null;
    } | null;
  } | null;

  /** null for a restricted (viewer) response. */
  security: {
    status: "documented";
    notes: string[];
  } | null;

  customDomain: {
    enabled: boolean;
    request: {
      id: string;
      requestedHost: string;
      status: string;
      tlsState: string;
      verifiedAt: string | null;
    } | null;
  };

  /** null for a restricted (viewer) response. */
  recentOperationalEvents: Array<{
    id: string;
    category: string;
    kind: string;
    severity: string;
    createdAt: string;
    detail: Record<string, unknown>;
  }> | null;

  /** Always populated, even for a restricted response — a launch-blocking issue is exactly the kind of thing every related role should be able to see. */
  launchBlockingIssues: string[];
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

/**
 * Assembles the full M12 launch-readiness snapshot for one app, straight
 * from persisted rows — never a cached or optimistic projection. Every
 * section that has no data yet reports `null`/`"unknown"`/`"not_configured"`
 * explicitly rather than being omitted or defaulted to a healthy-looking
 * value (see `ReadinessStatus`'s docstring — this is the concrete
 * implementation of that requirement).
 *
 * Access: `app.viewOperations` is granted at "viewer" (see authz.ts), so
 * every related role can call this — but a `role === "viewer"` caller gets
 * `restricted: true` with cost/quota/backup/security/jobs internals nulled
 * out, per the issue's "viewers receive a restricted read-only summary"
 * access rule. An unrelated actor never reaches this function at all —
 * `assertCapability` throws `NotFoundError` for them, same as every other
 * capability.
 */
export async function buildAppReadinessSnapshot(
  db: Db,
  actor: Actor,
  appId: string
): Promise<AppReadinessSnapshot> {
  const { app, role } = await assertCapability(
    db,
    actor,
    appId,
    "app.viewOperations"
  );
  const restricted = role === "viewer";
  const now = new Date();

  const [spec] = await db
    .select()
    .from(specifications)
    .where(eq(specifications.appId, appId))
    .limit(1);
  const [pinnedPreview] = spec?.pinnedPreviewBuildId
    ? await db
        .select()
        .from(previewBuilds)
        .where(eq(previewBuilds.id, spec.pinnedPreviewBuildId))
        .limit(1)
    : [null];

  const [approvedRelease] = await db
    .select()
    .from(releases)
    .where(and(eq(releases.appId, appId), eq(releases.status, "approved")))
    .orderBy(desc(releases.createdAt))
    .limit(1);

  const [domain] = await db
    .select()
    .from(appDomains)
    .where(and(eq(appDomains.appId, appId), eq(appDomains.status, "active")))
    .limit(1);
  const [productionRelease] = domain?.activeReleaseId
    ? await db
        .select()
        .from(releases)
        .where(eq(releases.id, domain.activeReleaseId))
        .limit(1)
    : [null];

  const [latestValidationRun] = await db
    .select()
    .from(validationRuns)
    .where(eq(validationRuns.appId, appId))
    .orderBy(desc(validationRuns.createdAt))
    .limit(1);

  const validationStatus: ReadinessStatus = !latestValidationRun
    ? "unknown"
    : latestValidationRun.status === "passed"
      ? "healthy"
      : latestValidationRun.status === "failed" ||
          latestValidationRun.status === "infrastructure_error"
        ? "unhealthy"
        : latestValidationRun.status === "flaky"
          ? "degraded"
          : "unknown";

  const [activeDeployment] = await db
    .select()
    .from(deployments)
    .where(
      and(
        eq(deployments.appId, appId),
        notInArray(deployments.status, [...TERMINAL_DEPLOYMENT_STATUSES_LOCAL])
      )
    )
    .orderBy(desc(deployments.createdAt))
    .limit(1);

  const recentDeployments = await db
    .select()
    .from(deployments)
    .where(eq(deployments.appId, appId))
    .orderBy(desc(deployments.createdAt))
    .limit(5);

  const deploymentStatus: ReadinessStatus = activeDeployment
    ? "degraded" // an in-flight deployment is neither a clean "healthy" nor a failure — surfaced distinctly, not glossed over
    : recentDeployments.length === 0
      ? "unknown"
      : recentDeployments[0].status === "succeeded"
        ? "healthy"
        : recentDeployments[0].status === "failed"
          ? "unhealthy"
          : recentDeployments[0].status === "rolled_back"
            ? "degraded"
            : "unknown";

  const [customDomainRequest] = await db
    .select()
    .from(customDomainRequests)
    .where(eq(customDomainRequests.appId, appId))
    .orderBy(desc(customDomainRequests.createdAt))
    .limit(1);

  const launchBlockingIssues: string[] = [];
  if (!approvedRelease)
    launchBlockingIssues.push(
      "No approved release exists yet — approve a validated version before deploying."
    );
  if (!latestValidationRun)
    launchBlockingIssues.push("This app has never been validated.");
  else if (latestValidationRun.status !== "passed")
    launchBlockingIssues.push(
      `Latest validation run has not passed (status: ${latestValidationRun.status}).`
    );
  if (!productionRelease)
    launchBlockingIssues.push(
      "No release has ever been deployed to production."
    );
  if (activeDeployment)
    launchBlockingIssues.push("A deployment is currently in progress.");

  if (!restricted) {
    const backupStatus = await getLatestBackupStatus(db);
    if (!backupStatus.lastBackup)
      launchBlockingIssues.push("No database backup has ever been recorded.");
    else if (backupStatus.status !== "healthy")
      launchBlockingIssues.push(
        "The most recent backup did not succeed or is stale."
      );
    const restoreRehearsal = await getLatestRestoreRehearsal(db);
    if (!restoreRehearsal)
      launchBlockingIssues.push(
        "Restore has never been rehearsed outside production."
      );
    else if (restoreRehearsal.status !== "succeeded")
      launchBlockingIssues.push(
        "The most recent restore rehearsal did not succeed."
      );
  }

  const base: AppReadinessSnapshot = {
    appId,
    generatedAt: now.toISOString(),
    role,
    restricted,
    versions: {
      draftVersionNumber: spec?.currentVersionNumber ?? 0,
      previewBuild: pinnedPreview
        ? {
            id: pinnedPreview.id,
            status: pinnedPreview.status,
            createdAt: pinnedPreview.createdAt.toISOString(),
          }
        : null,
      approvedRelease: approvedRelease
        ? {
            id: approvedRelease.id,
            versionLabel: approvedRelease.versionLabel,
            approvedAt: iso(approvedRelease.approvedAt),
          }
        : null,
      productionRelease: productionRelease
        ? {
            id: productionRelease.id,
            versionLabel: productionRelease.versionLabel,
            publishedAt: iso(productionRelease.publishedAt),
            activatedAt: iso(domain?.activatedAt ?? null),
          }
        : null,
    },
    validation: {
      status: validationStatus,
      latestRun: latestValidationRun
        ? {
            id: latestValidationRun.id,
            status: latestValidationRun.status,
            mandatoryGatesPassed: latestValidationRun.mandatoryGatesPassed,
            mandatoryGatesTotal: latestValidationRun.mandatoryGatesTotal,
            releaseEligible: latestValidationRun.releaseEligible,
            createdAt: latestValidationRun.createdAt.toISOString(),
          }
        : null,
    },
    deployment: {
      status: deploymentStatus,
      activeDeployment: activeDeployment
        ? {
            id: activeDeployment.id,
            status: activeDeployment.status,
            phase: activeDeployment.phase,
            isRollback: activeDeployment.isRollback,
            createdAt: activeDeployment.createdAt.toISOString(),
          }
        : null,
      recentEvents: recentDeployments.map((d) => ({
        id: d.id,
        status: d.status,
        phase: d.phase,
        isRollback: d.isRollback,
        createdAt: d.createdAt.toISOString(),
        activatedAt: iso(d.activatedAt),
        failureMessage: d.failureMessage,
      })),
    },
    aiUsage: null,
    quotas: null,
    storage: null,
    workflows: null,
    jobs: null,
    backup: null,
    security: null,
    recentOperationalEvents: null,
    customDomain: {
      enabled: isCustomDomainsEnabled(),
      request: customDomainRequest
        ? {
            id: customDomainRequest.id,
            requestedHost: customDomainRequest.requestedHost,
            status: customDomainRequest.status,
            tlsState: customDomainRequest.tlsState,
            verifiedAt: iso(customDomainRequest.verifiedAt),
          }
        : null,
    },
    launchBlockingIssues,
  };

  if (restricted) return base;

  // ── Everything below is owner/editor-only detail ──────────────────────

  const [lastGenerationJob] = await db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.appId, appId))
    .orderBy(desc(generationJobs.createdAt))
    .limit(1);

  const aiRequestsSnapshot = await checkQuotaSnapshot(
    db,
    app.ownerPrincipalId,
    "ai_requests_per_day_per_owner",
    () => countAiRequestsTodayForOwner(db, app.ownerPrincipalId)
  );

  const quotaCounters: Record<QuotaMetric, () => Promise<number>> = {
    apps_per_owner: () => countActiveAppsForOwner(db, app.ownerPrincipalId),
    active_generation_jobs_per_app: () =>
      countActiveGenerationJobsForApp(db, appId),
    ai_requests_per_day_per_owner: () =>
      countAiRequestsTodayForOwner(db, app.ownerPrincipalId),
    specification_versions_per_app: () =>
      countSpecificationVersionsForApp(db, appId),
    preview_builds_per_app: () => countPreviewBuildsForApp(db, appId),
    storage_bytes_per_app: () => sumStorageBytesForApp(db, appId),
    workflow_executions_per_day_per_app: () =>
      countWorkflowExecutionsTodayForApp(db, appId),
    concurrent_deployment_jobs_per_app: () =>
      countConcurrentDeploymentJobsForApp(db, appId),
    concurrent_validation_jobs_per_app: () =>
      countConcurrentValidationJobsForApp(db, appId),
    attachment_bytes_per_app: () => sumAttachmentBytesForApp(db, appId),
    attachments_per_app: () => countAttachmentsForApp(db, appId),
  };

  const quotas: QuotaSnapshotEntry[] = [];
  for (const metric of QUOTA_METRICS) {
    const scope = QUOTA_METRIC_SCOPE[metric];
    const scopeId = scope === "owner" ? app.ownerPrincipalId : appId;
    const snapshot = await checkQuotaSnapshot(
      db,
      scopeId,
      metric,
      quotaCounters[metric]
    );
    quotas.push({
      metric,
      label: QUOTA_METRIC_LABELS[metric],
      scope,
      current: snapshot.current,
      limit: snapshot.limit,
      exceeded: snapshot.exceeded,
    });
  }
  const storageQuota = quotas.find(
    (q) => q.metric === "storage_bytes_per_app"
  )!;
  const workflowQuota = quotas.find(
    (q) => q.metric === "workflow_executions_per_day_per_app"
  )!;

  for (const q of quotas) {
    if (q.exceeded)
      launchBlockingIssues.push(
        `Quota exceeded: ${q.label} (${q.current}/${q.limit}).`
      );
  }

  const [stuckGenerationJobs, stuckValidationRuns, stuckDeployments] =
    await Promise.all([
      db
        .select()
        .from(generationJobs)
        .where(
          and(
            eq(generationJobs.appId, appId),
            notInArray(generationJobs.status, [
              ...TERMINAL_GENERATION_JOB_STATUSES,
            ]),
            lt(generationJobs.leaseExpiresAt, now)
          )
        ),
      db
        .select()
        .from(validationRuns)
        .where(
          and(
            eq(validationRuns.appId, appId),
            notInArray(validationRuns.status, [
              ...TERMINAL_VALIDATION_RUN_STATUSES,
            ]),
            lt(validationRuns.leaseExpiresAt, now)
          )
        ),
      db
        .select()
        .from(deployments)
        .where(
          and(
            eq(deployments.appId, appId),
            notInArray(deployments.status, [
              ...TERMINAL_DEPLOYMENT_STATUSES_LOCAL,
            ]),
            lt(deployments.leaseExpiresAt, now)
          )
        ),
    ]);

  const [activeGenerationJobs, activeValidationRuns, activeDeployments] =
    await Promise.all([
      db
        .select()
        .from(generationJobs)
        .where(
          and(
            eq(generationJobs.appId, appId),
            notInArray(generationJobs.status, [
              ...TERMINAL_GENERATION_JOB_STATUSES,
            ])
          )
        ),
      db
        .select()
        .from(validationRuns)
        .where(
          and(
            eq(validationRuns.appId, appId),
            notInArray(validationRuns.status, [
              ...TERMINAL_VALIDATION_RUN_STATUSES,
            ])
          )
        ),
      db
        .select()
        .from(deployments)
        .where(
          and(
            eq(deployments.appId, appId),
            notInArray(deployments.status, [
              ...TERMINAL_DEPLOYMENT_STATUSES_LOCAL,
            ])
          )
        ),
    ]);

  const stuckCount =
    stuckGenerationJobs.length +
    stuckValidationRuns.length +
    stuckDeployments.length;
  if (stuckCount > 0)
    launchBlockingIssues.push(
      `${stuckCount} job(s) appear stuck (lease expired without progress).`
    );

  const backupStatus = await getLatestBackupStatus(db);
  const restoreRehearsal = await getLatestRestoreRehearsal(db);

  const recentEvents = await db
    .select()
    .from(operationalEvents)
    .where(eq(operationalEvents.appId, appId))
    .orderBy(desc(operationalEvents.createdAt))
    .limit(10);

  const securityNotes = [
    "IDOR/cross-owner isolation: enforced by lib/repositories/authz.ts#assertCapability on every app-scoped read/write.",
    "Preview/production data-environment separation: enforced by lib/generated-data/environment.ts.",
    "Secret/diagnostic redaction: enforced by lib/validation/redaction.ts before any log/detail is persisted.",
    "Full threat-model coverage and current findings: see docs/appbuilder-m12-threat-model.md.",
  ];

  return {
    ...base,
    aiUsage: {
      requestsToday: aiRequestsSnapshot.current,
      limit: aiRequestsSnapshot.limit,
      lastGenerationJob: lastGenerationJob
        ? {
            id: lastGenerationJob.id,
            status: lastGenerationJob.status,
            createdAt: lastGenerationJob.createdAt.toISOString(),
          }
        : null,
    },
    quotas,
    storage: {
      usedBytes: storageQuota.current,
      limitBytes: storageQuota.limit,
      exceeded: storageQuota.exceeded,
    },
    workflows: {
      executionsToday: workflowQuota.current,
      limit: workflowQuota.limit,
    },
    jobs: {
      active: [
        ...activeGenerationJobs.map((j) => ({
          kind: "generation" as const,
          id: j.id,
          status: j.status,
          createdAt: j.createdAt.toISOString(),
        })),
        ...activeValidationRuns.map((j) => ({
          kind: "validation" as const,
          id: j.id,
          status: j.status,
          createdAt: j.createdAt.toISOString(),
        })),
        ...activeDeployments.map((j) => ({
          kind: "deployment" as const,
          id: j.id,
          status: j.status,
          createdAt: j.createdAt.toISOString(),
        })),
      ],
      stuck: [
        ...stuckGenerationJobs.map((j) => ({
          kind: "generation" as const,
          id: j.id,
          status: j.status,
          leaseExpiresAt: iso(j.leaseExpiresAt),
        })),
        ...stuckValidationRuns.map((j) => ({
          kind: "validation" as const,
          id: j.id,
          status: j.status,
          leaseExpiresAt: iso(j.leaseExpiresAt),
        })),
        ...stuckDeployments.map((j) => ({
          kind: "deployment" as const,
          id: j.id,
          status: j.status,
          leaseExpiresAt: iso(j.leaseExpiresAt),
        })),
      ],
    },
    backup: {
      status: backupStatus.status,
      lastBackup: backupStatus.lastBackup,
      lastRestoreRehearsal: restoreRehearsal
        ? {
            status: restoreRehearsal.status,
            completedAt: iso(restoreRehearsal.completedAt),
            verifiedCounts: restoreRehearsal.verifiedCounts,
          }
        : null,
    },
    security: { status: "documented", notes: securityNotes },
    recentOperationalEvents: recentEvents.map((e) => ({
      id: e.id,
      category: e.category,
      kind: e.kind,
      severity: e.severity,
      createdAt: e.createdAt.toISOString(),
      detail: e.detail,
    })),
    launchBlockingIssues,
  };
}

export type { Actor };
