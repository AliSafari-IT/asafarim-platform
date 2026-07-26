/** Client-side mirror of the server-validated selection-context shape (lib/modification/selectionContext.ts). Never anything beyond stable spec identifiers. */
export interface SelectionContext {
  appId: string;
  specificationVersionNumber: number;
  pageId?: string;
  componentId?: string;
  componentKind?: string;
  label?: string;
}

export type ConversationRole = "user" | "assistant" | "system";
export type ConversationMessageType =
  | "user_request"
  | "ai_proposal"
  | "system_status"
  | "validation_result"
  | "applied_change"
  | "failure";
export type ConversationConfirmationState = "not_required" | "pending" | "confirmed" | "expired";

export interface ConversationMessage {
  id: string;
  conversationId: string;
  appId: string;
  role: ConversationRole;
  messageType: ConversationMessageType;
  content: string;
  authorPrincipalId: string | null;
  selectedContext: SelectionContext | null;
  baseVersionNumber: number | null;
  modificationJobId: string | null;
  diffSummary: SpecificationDiff | null;
  impactClassification: string | null;
  confirmationState: ConversationConfirmationState;
  resultingVersionNumber: number | null;
  resultingPreviewBuildId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
}

export type ModificationJobStatus =
  | "queued"
  | "interpreting"
  | "proposing"
  | "awaiting_confirmation"
  | "applying"
  | "validating"
  | "preparing_preview"
  | "ready"
  | "failed"
  | "cancelled";

export interface ModificationJob {
  id: string;
  appId: string;
  conversationId: string;
  triggeringMessageId: string;
  status: ModificationJobStatus;
  phase: string;
  attemptCount: number;
  baseVersionNumber: number;
  confirmationRequired: boolean;
  confirmationChecksum: string | null;
  confirmationBaseVersionNumber: number | null;
  confirmationExpiresAt: string | null;
  confirmationConfirmedAt: string | null;
  cancelRequestedAt: string | null;
  resultingVersionNumber: number | null;
  resultingPreviewBuildId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
}

export interface DiffEntry {
  path: (string | number)[];
  kind: "added" | "removed" | "changed";
  before?: unknown;
  after?: unknown;
}
export interface SpecificationDiff {
  entries: DiffEntry[];
}

export interface SpecificationVersion {
  id: string;
  versionNumber: number;
  parentVersionId: string | null;
  summary: string;
  checksum: string;
  createdByPrincipalId: string;
  createdAt: string;
  payload?: Record<string, unknown>;
}

export const TERMINAL_JOB_STATUSES: ReadonlySet<ModificationJobStatus> = new Set(["ready", "failed", "cancelled"]);

// ─── M10: validation runs, gates, artifacts, and the bounded repair loop ──

export type ValidationRunStatus = "pending" | "running" | "passed" | "failed" | "infrastructure_error" | "flaky" | "cancelled";
export type ValidationGateStatus = "pending" | "running" | "passed" | "failed" | "skipped" | "infrastructure_error" | "flaky" | "cancelled";

export interface ValidationRun {
  id: string;
  appId: string;
  specificationVersionId: string;
  specificationChecksum: string;
  previewBuildId: string | null;
  registryVersion: string;
  gateSetVersion: string;
  requestSource: "manual" | "repair" | "api";
  status: ValidationRunStatus;
  mandatoryGatesTotal: number;
  mandatoryGatesPassed: number;
  releaseEligible: boolean;
  failureCode: string | null;
  failureMessage: string | null;
  cancelRequestedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface ValidationGateResult {
  id: string;
  runId: string;
  gateKey: string;
  gateVersion: string;
  mandatory: boolean;
  status: ValidationGateStatus;
  skipReason: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  structuredFailures: { code: string; message: string; path?: (string | number)[] }[];
  evidence: Record<string, unknown>;
  artifactIds: string[];
  durationMs: number | null;
}

export interface ValidationArtifact {
  id: string;
  runId: string;
  gateKey: string | null;
  kind: "screenshot" | "trace" | "report" | "log" | "summary";
  label: string;
  contentType: string;
  sizeBytes: number;
  retentionExpiresAt: string | null;
}

export type RepairAttemptStatus = "queued" | "classifying" | "proposing" | "awaiting_confirmation" | "applying" | "revalidating" | "completed" | "failed" | "cancelled";

export interface RepairAttempt {
  id: string;
  appId: string;
  originatingRunId: string;
  attemptNumber: number;
  status: RepairAttemptStatus;
  phase: string;
  failureClassification: string | null;
  targetGateKeys: string[];
  confirmationRequired: boolean;
  confirmationChecksum: string | null;
  confirmationExpiresAt: string | null;
  resultingVersionNumber: number | null;
  resultingValidationRunId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  cancelRequestedAt: string | null;
  createdAt: string;
}

export const TERMINAL_VALIDATION_RUN_STATUSES: ReadonlySet<ValidationRunStatus> = new Set(["passed", "failed", "infrastructure_error", "flaky", "cancelled"]);
export const TERMINAL_REPAIR_ATTEMPT_STATUSES: ReadonlySet<RepairAttemptStatus> = new Set(["completed", "failed", "cancelled"]);

// ─── M11: releases and deployments ─────────────────────────────────────

export type ReleaseStatus = "draft" | "approved" | "published" | "superseded" | "archived";

export interface Release {
  id: string;
  appId: string;
  specificationVersionId: string;
  specificationVersionNumber: number;
  specificationChecksum: string;
  previewBuildId: string | null;
  registryVersion: string;
  validationRunId: string | null;
  dataCompatibility: "none" | "safe" | "requires_review" | "unsafe";
  appSlug: string;
  productionHost: string;
  versionLabel: string;
  status: ReleaseStatus;
  preparedByPrincipalId: string | null;
  approvedByPrincipalId: string | null;
  approvedAt: string | null;
  publishedByPrincipalId: string | null;
  publishedAt: string | null;
  previousReleaseId: string | null;
  createdAt: string;
}

export type DeploymentStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled" | "rolled_back";
export type DeploymentPhase =
  | "queued"
  | "checking_eligibility"
  | "freezing_manifest"
  | "reserving_slug"
  | "checking_data_compatibility"
  | "preparing_artifact"
  | "publishing"
  | "health_checking"
  | "smoke_testing"
  | "activating"
  | "verifying"
  | "completed"
  | "rolling_back";

export interface Deployment {
  id: string;
  appId: string;
  releaseId: string;
  environment: "preview" | "production";
  status: DeploymentStatus;
  phase: DeploymentPhase;
  isRollback: boolean;
  supersededReleaseId: string | null;
  attemptCount: number;
  activatedAt: string | null;
  deployedByPrincipalId: string;
  deployedAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  cancelRequestedAt: string | null;
  createdAt: string;
}

export interface DeploymentStep {
  id: string;
  deploymentId: string;
  phase: DeploymentPhase;
  ok: boolean;
  message: string;
  durationMs: number | null;
  createdAt: string;
}

export const TERMINAL_DEPLOYMENT_STATUSES: ReadonlySet<DeploymentStatus> = new Set(["succeeded", "failed", "cancelled", "rolled_back"]);

export type FetchJsonError = Error & { code?: string; status?: number; body?: unknown };

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof body?.error === "string" ? body.error : `Request failed (${res.status})`;
    const err = new Error(message) as FetchJsonError;
    err.code = typeof body?.code === "string" ? body.code : undefined;
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body as T;
}
