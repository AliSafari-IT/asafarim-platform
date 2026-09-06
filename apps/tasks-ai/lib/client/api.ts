"use client";

/**
 * Thin typed client over /api/v1. Every UI data call goes through here so
 * error handling, the correlation header, and optimistic-concurrency
 * plumbing live in one place (docs/adr/0003-api-first-boundary.md).
 */
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

async function call<T>(
  path: string,
  init: RequestInit & { version?: number } = {},
): Promise<T> {
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
  return json.data as T;
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
  createTask: (slug: string, body: Record<string, unknown>) =>
    call<Task>(`/workspaces/${slug}/tasks`, { method: "POST", body: JSON.stringify(body) }),
  updateTask: (slug: string, id: string, version: number, body: Record<string, unknown>) =>
    call<Task>(`/workspaces/${slug}/tasks/${id}`, {
      method: "PATCH",
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
  runAiJob: (slug: string, body: { kind: string; input: string; projectId?: string }) =>
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
};

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

};

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
  archivedAt: string | null;
  version: number;
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
  position: number;
  source: string;
  version: number;
}
