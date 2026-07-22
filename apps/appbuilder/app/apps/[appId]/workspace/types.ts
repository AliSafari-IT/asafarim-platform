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
