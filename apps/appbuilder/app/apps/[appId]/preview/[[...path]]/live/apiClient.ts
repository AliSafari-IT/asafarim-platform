import { LiveApiError, type ApiErrorPayload, type GeneratedRecord } from "./types";

/**
 * Thin, typed client for the M09 runtime API (`/api/apps/{appId}/runtime/*`)
 * — every function here is a plain `fetch` against those already-authorized,
 * already-scoped routes. This client adds no authorization of its own (it
 * can't: it runs in the browser); every one of these calls is re-checked
 * server-side against the caller's real session on every request. Passing
 * `simulateRoleId` only ever narrows what the server-side check evaluates —
 * see routeHelpers.ts#resolveContextForRequest for the actual enforcement.
 */

function withSimulation(path: string, simulateRoleId: string | undefined): string {
  if (!simulateRoleId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}simulateRoleId=${encodeURIComponent(simulateRoleId)}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = (await res.json().catch(() => ({ error: "Unexpected response" }))) as ApiErrorPayload & Record<string, unknown>;
  if (!res.ok) throw new LiveApiError(res.status, payload);
  return payload as T;
}

export interface ListRecordsParams {
  page?: number;
  pageSize?: number;
  sortFieldId?: string;
  sortDirection?: "asc" | "desc";
  search?: string;
  includeArchived?: boolean;
  filterFieldId?: string;
  filterValue?: string;
}

export interface ListRecordsResponse {
  records: GeneratedRecord[];
  total: number;
  page: number;
  pageSize: number;
  simulated: boolean;
}

function buildListQuery(params: ListRecordsParams): string {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  if (params.sortFieldId) search.set("sortFieldId", params.sortFieldId);
  if (params.sortDirection) search.set("sortDirection", params.sortDirection);
  if (params.search) search.set("search", params.search);
  if (params.includeArchived) search.set("includeArchived", "true");
  if (params.filterFieldId && params.filterValue) {
    search.set("filters", JSON.stringify([{ fieldId: params.filterFieldId, op: "eq", value: params.filterValue }]));
  }
  return search.toString();
}

export function listRecords(appId: string, entityId: string, params: ListRecordsParams, simulateRoleId: string | undefined): Promise<ListRecordsResponse> {
  const qs = buildListQuery(params);
  const base = `/api/apps/${appId}/runtime/entities/${entityId}/records${qs ? `?${qs}` : ""}`;
  return request(withSimulation(base, simulateRoleId));
}

export function getRecord(appId: string, entityId: string, recordId: string, simulateRoleId: string | undefined): Promise<{ record: GeneratedRecord; simulated: boolean }> {
  return request(withSimulation(`/api/apps/${appId}/runtime/entities/${entityId}/records/${recordId}`, simulateRoleId));
}

export function createRecord(
  appId: string,
  entityId: string,
  data: Record<string, unknown>,
  simulateRoleId: string | undefined,
): Promise<{ record: GeneratedRecord; simulated: boolean }> {
  return request(withSimulation(`/api/apps/${appId}/runtime/entities/${entityId}/records`, simulateRoleId), {
    method: "POST",
    body: JSON.stringify({ data }),
  });
}

export function updateRecord(
  appId: string,
  entityId: string,
  recordId: string,
  data: Record<string, unknown>,
  baseRevision: number,
  simulateRoleId: string | undefined,
): Promise<{ record: GeneratedRecord; simulated: boolean }> {
  return request(withSimulation(`/api/apps/${appId}/runtime/entities/${entityId}/records/${recordId}`, simulateRoleId), {
    method: "PATCH",
    body: JSON.stringify({ data, baseRevision }),
  });
}

export function archiveRecord(appId: string, entityId: string, recordId: string, simulateRoleId: string | undefined): Promise<{ record: GeneratedRecord; simulated: boolean }> {
  return request(withSimulation(`/api/apps/${appId}/runtime/entities/${entityId}/records/${recordId}/archive`, simulateRoleId), { method: "POST" });
}

export function restoreRecord(appId: string, entityId: string, recordId: string, simulateRoleId: string | undefined): Promise<{ record: GeneratedRecord; simulated: boolean }> {
  return request(withSimulation(`/api/apps/${appId}/runtime/entities/${entityId}/records/${recordId}/restore`, simulateRoleId), { method: "POST" });
}

export function getDashboardCounts(appId: string, entityIds: string[], simulateRoleId: string | undefined): Promise<{ counts: Array<{ entityId: string; count: number }>; simulated: boolean }> {
  return request(withSimulation(`/api/apps/${appId}/runtime/dashboard?entityIds=${entityIds.map(encodeURIComponent).join(",")}`, simulateRoleId));
}

export function getGroupedCounts(
  appId: string,
  entityId: string,
  groupByFieldId: string,
  simulateRoleId: string | undefined,
): Promise<{ counts: Array<{ value: string; label: string; count: number }>; simulated: boolean }> {
  return request(withSimulation(`/api/apps/${appId}/runtime/entities/${entityId}/grouped-counts?groupByFieldId=${encodeURIComponent(groupByFieldId)}`, simulateRoleId));
}

export function seedDemoData(appId: string): Promise<{ ok: true }> {
  return request(`/api/apps/${appId}/runtime/seed-reset`, { method: "POST", body: JSON.stringify({ confirm: true }) });
}
