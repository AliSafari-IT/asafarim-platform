// Client-side mirror of lib/observability/readiness.ts#AppReadinessSnapshot.
// Kept as a plain structural type (not imported from server code — this
// file is bundled into the client) so any drift is a type error here, not
// a silent runtime mismatch.
export { fetchJson, type FetchJsonError } from "../workspace/types";

export type ReadinessStatus =
  "healthy" | "degraded" | "unhealthy" | "unknown" | "not_configured";

export type QuotaMetric =
  | "apps_per_owner"
  | "active_generation_jobs_per_app"
  | "ai_requests_per_day_per_owner"
  | "specification_versions_per_app"
  | "preview_builds_per_app"
  | "storage_bytes_per_app"
  | "workflow_executions_per_day_per_app"
  | "concurrent_deployment_jobs_per_app"
  | "concurrent_validation_jobs_per_app"
  | "attachment_bytes_per_app"
  | "attachments_per_app"
  | "references_per_app"
  | "reference_fetches_per_day_per_app";

/** M13 slice G — one dependency/readiness section (lib/observability/m13Readiness.ts). */
export interface M13ReadinessSection {
  status: ReadinessStatus;
  summary: string;
  detail: Record<string, unknown>;
}

export interface FeatureFlagState {
  key: "attachments" | "vision" | "contextualMemory" | "planning" | "urlImports";
  envVar: string;
  enabled: boolean;
  usingDefault: boolean;
  disabledEffect: string;
}

export interface M13ReadinessSnapshot {
  storage: M13ReadinessSection;
  extraction: M13ReadinessSection;
  malwareScanning: M13ReadinessSection;
  modelVision: M13ReadinessSection;
  urlImport: M13ReadinessSection;
  cleanupLag: M13ReadinessSection;
  evaluation: M13ReadinessSection;
  featureFlags: FeatureFlagState[];
}

/**
 * M13 slice G metrics. Only the fields this view actually renders are
 * mirrored — the server returns more (see lib/observability/metrics.ts), and
 * a structural type means an unrendered field is not an error.
 */
export interface M13MetricsSnapshot {
  windowDays: number;
  attachments: {
    byStatus: Record<string, number>;
    readyBytes: number;
    extractedTextChars: number;
    quarantined: number;
    unscannedCommits: number;
    sweptUnclaimed: number;
    overdueUnclaimed: number;
    processingSecondsP95: number | null;
  };
  context: {
    jobsWithManifest: number;
    meanEstimatedTokens: number | null;
    jobsWithTruncation: number;
    redactionFlagCounts: Record<string, number>;
  };
  resolver: {
    resolved: number;
    ambiguous: number;
    unresolved: number;
    resolutionRate: number | null;
    meanConfidence: number | null;
  };
  clarification: {
    jobsThatAsked: number;
    totalRounds: number;
    answered: number;
    abandoned: number;
    answerRate: number | null;
  };
  plans: {
    created: number;
    completed: number;
    stopped: number;
    completionRate: number | null;
  };
  references: {
    totalReferences: number;
    imported: number;
    blocked: number;
    rateLimited: number;
    failing: number;
  };
  tokens: { promptTokens: number; completionTokens: number; providerCalls: number };
  cost: {
    estimated: true;
    currency: "USD";
    totalUsd: number;
    unratedModels: string[];
  };
}

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
  role: "owner" | "editor" | "viewer";
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

  aiUsage: {
    requestsToday: number;
    limit: number;
    lastGenerationJob: { id: string; status: string; createdAt: string } | null;
  } | null;
  quotas: QuotaSnapshotEntry[] | null;
  storage: { usedBytes: number; limitBytes: number; exceeded: boolean } | null;
  workflows: { executionsToday: number; limit: number } | null;

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

  security: { status: "documented"; notes: string[] } | null;

  /** M13 slice G — null for a restricted (viewer) response. */
  m13: M13ReadinessSnapshot | null;
  /** M13 slice G — null for a restricted (viewer) response. */
  m13Metrics: M13MetricsSnapshot | null;

  /** M13 slice F — public-reference import health. */
  referenceImport: {
    status: ReadinessStatus;
    cacheTtlSeconds: number;
    githubAuthentication: string;
    cached: number;
    stale: number;
    unavailable: number;
    lastFetchedAt: string | null;
    lastFailureCode: string | null;
  };

  recentOperationalEvents: Array<{
    id: string;
    category: string;
    kind: string;
    severity: string;
    createdAt: string;
    detail: Record<string, unknown>;
  }> | null;

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

  launchBlockingIssues: string[];
}

export interface CustomDomainRequest {
  id: string;
  requestedHost: string;
  status: string;
  tlsState: string;
  verifiedAt: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export { formatBytes };
