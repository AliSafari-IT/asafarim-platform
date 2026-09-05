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
