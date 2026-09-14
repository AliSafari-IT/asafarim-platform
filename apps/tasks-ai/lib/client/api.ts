"use client";

/**
 * Thin typed client over /api/v1. Every UI data call goes through here so
 * error handling, the correlation header, and optimistic-concurrency
 * plumbing live in one place (docs/adr/0003-api-first-boundary.md).
 */
import type {
  MyWorkContextCounts,
  MyWorkItem,
  MyWorkSummary,
} from "../work/my-work";

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: unknown;
}

export class ClientApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(status: number, body: ApiErrorShape) {
    super(body.message);
    this.name = "ClientApiError";
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

async function request(
  path: string,
  init: RequestInit & { version?: number } = {},
): Promise<{
  data?: unknown;
  page?: { nextCursor: string | null };
  meta?: Record<string, unknown>;
}> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (init.version != null) headers.set("if-match", `"${init.version}"`);
  if (init.method === "POST" && !headers.has("idempotency-key")) {
    headers.set("idempotency-key", crypto.randomUUID());
  }

  const res = await fetch(`/api/v1${path}`, { ...init, headers });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ClientApiError(res.status, json.error ?? { code: "internal", message: res.statusText });
  return json;
}

async function call<T>(
  path: string,
  init: RequestInit & { version?: number } = {},
): Promise<T> {
  return (await request(path, init)).data as T;
}

/** One page of a cursor-paginated collection. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

async function callPage<T>(
  path: string,
  init: RequestInit & { version?: number } = {},
): Promise<Page<T>> {
  const json = await request(path, init);
  return { items: (json.data ?? []) as T[], nextCursor: json.page?.nextCursor ?? null };
}

/** A page that also carries view-level context (see `page()` in lib/api/http). */
async function callPageWithMeta<T, M>(
  path: string,
  init: RequestInit & { version?: number } = {},
): Promise<Page<T> & { meta: M }> {
  const json = await request(path, init);
  return {
    items: (json.data ?? []) as T[],
    nextCursor: json.page?.nextCursor ?? null,
    meta: (json.meta ?? {}) as M,
  };
}

export const api = {
  listWorkspaces: () => call<Workspace[]>("/workspaces"),
  createWorkspace: (body: { name: string; slug: string }) =>
    call<Workspace>("/workspaces", { method: "POST", body: JSON.stringify(body) }),

  listProjects: (slug: string) =>
    call<Project[]>(`/workspaces/${slug}/projects`),
  createProject: (slug: string, body: Record<string, unknown>) =>
    call<Project>(`/workspaces/${slug}/projects`, { method: "POST", body: JSON.stringify(body) }),
  updateProject: (slug: string, id: string, version: number, body: Record<string, unknown>) =>
    call<Project>(`/workspaces/${slug}/projects/${id}`, {
      method: "PATCH",
      version,
      body: JSON.stringify(body),
    }),

  listTasks: (slug: string, query: Record<string, string> = {}) =>
    call<Task[]>(`/workspaces/${slug}/tasks?${new URLSearchParams(query)}`),
  /**
   * One task by id. The detail drawer has to use this rather than picking a
   * row out of a generic list page: every list is paged and ordered for its
   * own surface, so a task that is visible in My Work need not appear in the
   * first page of `listTasks`.
   */
  getTask: (slug: string, id: string) => call<Task>(`/workspaces/${slug}/tasks/${id}`),
  createTask: (slug: string, body: Record<string, unknown>) =>
    call<Task>(`/workspaces/${slug}/tasks`, { method: "POST", body: JSON.stringify(body) }),
  updateTask: (slug: string, id: string, version: number, body: Record<string, unknown>) =>
    call<Task>(`/workspaces/${slug}/tasks/${id}`, {
      method: "PATCH",
      version,
      body: JSON.stringify(body),
    }),
  // --- capture + Inbox triage (#366) ---
  listInbox: (slug: string, query: Record<string, string> = {}) =>
    callPage<InboxItem>(`/workspaces/${slug}/inbox?${new URLSearchParams(query)}`),
  listMembers: (slug: string, query: Record<string, string> = {}) =>
    callPage<WorkspaceMember>(`/workspaces/${slug}/members?${new URLSearchParams(query)}`),
  /**
   * `version` is the InboxItem version the row was rendered from: the server
   * refuses the triage with conflict_version if somebody else moved first.
   */
  triageTask: (slug: string, id: string, body: Record<string, unknown>, version?: number) =>
    call<Task>(`/workspaces/${slug}/tasks/${id}/triage`, {
      method: "POST",
      version,
      body: JSON.stringify(body),
    }),

  // --- My Work execution view (#367) ---
  myWork: (slug: string, query: Record<string, string> = {}) =>
    callPageWithMeta<MyWorkItem, MyWorkMeta>(
      `/workspaces/${slug}/my-work?${new URLSearchParams(query)}`,
    ),
  /**
   * The scoped quick edit behind My Work's planning actions. `version` is
   * the row's version: a stale one loses with conflict_version rather than
   * overwriting somebody else's change.
   */
  planTask: (slug: string, id: string, body: Record<string, unknown>, version?: number) =>
    call<Task>(`/workspaces/${slug}/tasks/${id}/plan`, {
      method: "POST",
      version,
      body: JSON.stringify(body),
    }),

  completeTask: (slug: string, id: string) =>
    call<Task>(`/workspaces/${slug}/tasks/${id}/complete`, { method: "POST" }),
  deleteTask: (slug: string, id: string, version: number) =>
    call<Task>(`/workspaces/${slug}/tasks/${id}`, { method: "DELETE", version }),

  // --- AI copilot (M06/M07) ---
  aiSettings: (slug: string) => call<AiSettings>(`/workspaces/${slug}/ai/settings`),
  aiUsage: (slug: string) => call<AiUsage>(`/workspaces/${slug}/ai/usage`),
  /**
   * `taskId` scopes the draft to an existing task: the server resolves it,
   * tells the model it may parent under and update that task, and binds the
   * proposal to it so apply cannot address anything else (#377).
   */
  runAiJob: (
    slug: string,
    body: { kind: string; input: string; projectId?: string; taskId?: string },
  ) =>
    call<{ job: AiJob; proposal: ProposalRow; degraded?: boolean }>(
      `/workspaces/${slug}/ai/jobs`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  getProposal: (slug: string, id: string) =>
    call<ProposalRow>(`/workspaces/${slug}/ai/proposals/${id}`),
  applyProposal: (
    slug: string,
    id: string,
    body: { projectId: string; accept?: number[]; editedOperations?: unknown[] },
    confirmHigh = false,
  ) =>
    call<ProposalRow>(
      `/workspaces/${slug}/ai/proposals/${id}/apply${confirmHigh ? "?confirm=high" : ""}`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  rejectProposal: (slug: string, id: string, reason?: string) =>
    call<{ rejected: true }>(`/workspaces/${slug}/ai/proposals/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  undoProposal: (slug: string, id: string) =>
    call<{ undone: true }>(`/workspaces/${slug}/ai/proposals/${id}/undo`, { method: "POST" }),
  proposalFeedback: (slug: string, id: string, body: Record<string, unknown>) =>
    call<unknown>(`/workspaces/${slug}/ai/proposals/${id}/feedback`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  aiMetrics: (slug: string) => call<AiMetrics>(`/workspaces/${slug}/ai/metrics`),

  // --- collaboration (M04) ---
  listComments: (slug: string, taskId: string) =>
    call<Comment[]>(`/workspaces/${slug}/tasks/${taskId}/comments`),
  addComment: (slug: string, taskId: string, body: string) =>
    call<Comment>(`/workspaces/${slug}/tasks/${taskId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
  listNotifications: (slug: string, unreadOnly = false) =>
    call<Notification[]>(`/workspaces/${slug}/notifications${unreadOnly ? "?unread=true" : ""}`),
  markNotificationsRead: (slug: string, ids: string[]) =>
    call<{ marked: number }>(`/workspaces/${slug}/notifications/read`, {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),

  // --- workspace admin (M04/M12/M14) ---
  listInvitations: (slug: string) => call<Invitation[]>(`/workspaces/${slug}/invitations`),
  createInvitation: (slug: string, body: { email: string; role?: string }) =>
    call<Invitation>(`/workspaces/${slug}/invitations`, { method: "POST", body: JSON.stringify(body) }),
  revokeInvitation: (slug: string, id: string) =>
    call<{ revoked: true }>(`/workspaces/${slug}/invitations/${id}`, { method: "DELETE" }),
  updateAiSettings: (slug: string, body: Record<string, unknown>) =>
    call<AiSettings>(`/workspaces/${slug}/ai/settings`, { method: "PATCH", body: JSON.stringify(body) }),
  billingUsage: (slug: string) => call<BillingUsage>(`/workspaces/${slug}/billing/usage`),

  // --- search (M05) ---
  search: (slug: string, q: string, types?: string) =>
    call<{ hits?: SearchHit[]; recent?: { query: string; ranAt: string }[] }>(
      `/workspaces/${slug}/search?q=${encodeURIComponent(q)}${types ? `&types=${types}` : ""}`,
    ),
  listSavedSearches: (slug: string) => call<SavedSearch[]>(`/workspaces/${slug}/saved-searches`),
  createSavedSearch: (slug: string, body: { name: string; query: string }) =>
    call<SavedSearch>(`/workspaces/${slug}/saved-searches`, { method: "POST", body: JSON.stringify(body) }),
  deleteSavedSearch: (slug: string, id: string) =>
    call<{ deleted: true }>(`/workspaces/${slug}/saved-searches/${id}`, { method: "DELETE" }),

  // --- imports (M05) ---
  createImport: (
    slug: string,
    body: {
      kind: "csv" | "json";
      filename: string;
      projectId: string;
      mapping: Record<string, string>;
      content: string;
      /** Land the rows in the Inbox for review instead of straight into plan (#366). */
      captureToInbox?: boolean;
    },
  ) => call<ImportSummary>(`/workspaces/${slug}/imports`, { method: "POST", body: JSON.stringify(body) }),
  applyImport: (slug: string, id: string) =>
    call<ImportSummary>(`/workspaces/${slug}/imports/${id}/apply`, { method: "POST" }),

  // --- automations (M09) ---
  listRules: (slug: string) => call<AutomationRule[]>(`/workspaces/${slug}/automations/rules`),
  createRule: (slug: string, body: Record<string, unknown>) =>
    call<AutomationRule>(`/workspaces/${slug}/automations/rules`, { method: "POST", body: JSON.stringify(body) }),
  setRuleState: (slug: string, id: string, state: "active" | "paused" | "draft") =>
    call<{ id: string; state: string }>(`/workspaces/${slug}/automations/rules/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ state }),
    }),
  dryRunRule: (slug: string, id: string, sampleEvent: Record<string, unknown>) =>
    call<DryRunResult>(`/workspaces/${slug}/automations/rules/${id}/dry-run`, {
      method: "POST",
      body: JSON.stringify(sampleEvent),
    }),
  listRuns: (slug: string, id: string) =>
    call<AutomationRun[]>(`/workspaces/${slug}/automations/rules/${id}/runs`),

  // --- audit (M12) ---
  searchAudit: (slug: string, params: Record<string, string> = {}) =>
    call<{ items: AuditRow[]; nextCursor: string | null }>(
      `/workspaces/${slug}/admin/audit?${new URLSearchParams(params)}`,
    ),

  // --- feedback board (M13) ---
  listFeedback: (slug: string, query: Record<string, string> = {}) =>
    call<FeedbackItem[]>(`/workspaces/${slug}/feedback?${new URLSearchParams(query)}`),
  createFeedback: (slug: string, body: { source: string; severity: string; title: string; detail: string }) =>
    call<FeedbackItem>(`/workspaces/${slug}/feedback`, { method: "POST", body: JSON.stringify(body) }),
  triageFeedback: (slug: string, id: string, body: Record<string, unknown>) =>
    call<FeedbackItem>(`/workspaces/${slug}/feedback/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  // --- signal feedback (M08) ---
  signalFeedback: (slug: string, body: Record<string, unknown>) =>
    call<unknown>(`/workspaces/${slug}/signals/feedback`, { method: "POST", body: JSON.stringify(body) }),
};

export interface SearchHit {
  type: "task" | "project" | "comment" | "label";
  id: string;
  title: string;
  snippet?: string;
  projectId?: string;
}
export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  createdAt: string;
}
export interface ImportSummary {
  id: string;
  state: string;
  kind: string;
  filename: string;
  totalRows: number;
  appliedRows: number;
  failedRows: number;
  duplicateRows: number;
  okRows: number;
  errors: { rowKey: string; errors: string[] }[];
}
export interface AutomationRule {
  id: string;
  name: string;
  state: "draft" | "active" | "paused";
  trigger: { event: string; filters: unknown[] };
  conditions: unknown[];
  actions: { type: string }[];
  maxRunsPerHour: number;
  lastRunAt: string | null;
}
export interface DryRunResult {
  triggered: boolean;
  conditionsMet: boolean;
  wouldRun: boolean;
  plannedActions: { type: string }[];
  loopRisk: boolean;
}
export interface AutomationRun {
  id: string;
  state: string;
  log: unknown[];
  error: string | null;
  createdAt: string;
}
export interface AuditRow {
  id: string;
  name: string;
  actorType: string;
  actorId: string | null;
  targetType: string | null;
  targetId: string | null;
  occurredAt: string;
  data: Record<string, unknown>;
}
export interface FeedbackItem {
  id: string;
  source: string;
  severity: string;
  state: string;
  title: string;
  detail: string;
  ownerId: string | null;
  respondBy: string;
  respondedAt: string | null;
  linkedChange: string | null;
  createdAt: string;
}

export interface Comment {
  id: string;
  taskId: string;
  authorId: string;
  body: string;
  mentions: string[];
  editedAt: string | null;
  createdAt: string;
}
export interface Notification {
  id: string;
  kind: string;
  taskId: string | null;
  actorId: string | null;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}
export interface Invitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
}
export interface BillingUsage {
  tier: string;
  status: string;
  billingOpen: boolean;
  estimatedMonthlyCents: number | null;
  meters: {
    meter: string;
    used: number;
    included: number;
    topUp: number;
    limit: number;
    remaining: number;
    overage: boolean;
    pressure: number;
  }[];
  costDriver: string;
  note: string;
}

export interface AiSettings {
  enabled: boolean;
  monthlyBudgetUsd: number | null;
  maxBlastRadius: number;
  provider: string;
  model: string;
}
export interface AiUsage {
  monthUsd: number;
  monthJobs: number;
  budgetUsd: number | null;
  jobQuota: number | null;
  enabled: boolean;
}
export interface AiJob {
  id: string;
  kind: string;
  state: string;
  provider: string;
  model: string;
  costUsd: number | null;
}
export interface ProposalRow {
  id: string;
  kind: string;
  state: string;
  summary: string | null;
  operations: AiOperation[];
  /** What the model could not resolve from the source (#368). */
  openQuestions?: string[] | null;
}
export type AiOperation =
  | {
      op: "create_task";
      ref: string;
      fields: { title: string; description?: string; estimate?: number; parentRef?: string };
      confidence: number;
      citations: { span: [number, number] | null; assumption: boolean; quote?: string }[];
    }
  | {
      op: "update_task";
      taskId: string;
      fields: { title?: string; description?: string; estimate?: number };
      confidence: number;
      citations: { span: [number, number] | null; assumption: boolean }[];
    }
  | {
      op: "link_tasks";
      fromRef: string;
      toRef: string;
      kind: "blocks" | "relates" | "duplicates";
      confidence: number;
      citations: { span: [number, number] | null; assumption: boolean }[];
    };
export interface AiMetrics {
  windowDays: number;
  proposalsGenerated: number;
  proposalsApplied: number;
  acceptanceRate: number | null;
  avgEditDistance: number | null;
  avgTimeSavedMin: number | null;
  avgTrust: number | null;
  costUsd: number;
  correctionReasons: string[];
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  role?: string;
}
export interface Project {
  id: string;
  key: string;
  name: string;
  description: string | null;
  visibility: "workspace" | "private";
  /** The workspace Inbox container (#366) — not a project people pick. */
  isInbox: boolean;
  archivedAt: string | null;
  version: number;
}
/** One row of the triage Inbox (#366), with the context triage needs. */
export interface InboxItem {
  id: string;
  title: string;
  description: string | null;
  projectId: string;
  projectName: string;
  projectIsInbox: boolean;
  assigneeId: string | null;
  dueDate: string | null;
  source: string;
  createdAt: string;
  version: number;
}
/**
 * View-level context for My Work (#367). The row type itself lives in
 * lib/work/my-work.ts — a pure module both the server and this client
 * import, so the contract has exactly one definition.
 */
export interface MyWorkMeta {
  summary: MyWorkSummary;
  counts: MyWorkContextCounts;
}
export type { MyWorkItem, MyWorkSummary, MyWorkContextCounts };

export interface WorkspaceMember {
  id: string;
  role: string;
  platformUserId: string;
  isMe: boolean;
}
export interface Task {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  description: string | null;
  assigneeId: string | null;
  statusId: string | null;
  estimate: number | null;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  /** NULL = still waiting in the Inbox (#366, lib/capture/inbox.ts). */
  triagedAt: string | null;
  position: number;
  source: string;
  version: number;
}
