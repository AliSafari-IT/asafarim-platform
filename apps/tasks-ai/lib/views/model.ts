/**
 * The one saved-view / filter model that backs every view (Inbox, My Work,
 * list, board, calendar, timeline). A SavedView row stores `config` in this
 * shape; the UI and the API both read it. Pure and framework-free so it is
 * unit-testable and reusable on the server.
 */
export type ViewType = "inbox" | "my_work" | "list" | "board" | "calendar" | "timeline";

export type FilterOp = "eq" | "neq" | "in" | "before" | "after" | "is_set" | "is_unset";

export interface FilterClause {
  field:
    | "status"
    | "assignee"
    | "label"
    | "project"
    | "dueDate"
    | "parent"
    | "completed"
    /**
     * Inbox semantics (issue #366): `triage is_unset` means "captured but
     * not organized yet". It is a persisted task field, not a synonym for
     * "open" — see lib/capture/inbox.ts.
     */
    | "triage";
  op: FilterOp;
  value?: string | string[] | null;
}

export interface ViewConfig {
  type: ViewType;
  /** AND-combined clauses. */
  filters: FilterClause[];
  sort: { field: "position" | "dueDate" | "createdAt" | "updatedAt" | "title"; dir: "asc" | "desc" };
  /** For board: the field to group columns by. */
  groupBy?: "status" | "assignee" | "project" | "none";
}

export const DEFAULT_VIEWS: Record<ViewType, ViewConfig> = {
  // Inbox is *captured work awaiting triage*, not "every open task" — that
  // was the overlap with every other view (issue #366).
  inbox: {
    type: "inbox",
    filters: [
      { field: "triage", op: "is_unset" },
      { field: "completed", op: "eq", value: "false" },
    ],
    sort: { field: "createdAt", dir: "desc" },
  },
  // My Work is *planned* open work assigned to me. An item still waiting in
  // the Inbox is not planned yet, even if it already has my name on it —
  // triaging it is what moves it into execution (issue #366).
  my_work: {
    type: "my_work",
    filters: [
      { field: "assignee", op: "eq", value: "@me" },
      { field: "completed", op: "eq", value: "false" },
      { field: "triage", op: "is_set" },
    ],
    sort: { field: "dueDate", dir: "asc" },
  },
  list: { type: "list", filters: [], sort: { field: "position", dir: "asc" } },
  board: {
    type: "board",
    filters: [],
    sort: { field: "position", dir: "asc" },
    groupBy: "status",
  },
  calendar: { type: "calendar", filters: [], sort: { field: "dueDate", dir: "asc" } },
  timeline: { type: "timeline", filters: [], sort: { field: "dueDate", dir: "asc" } },
};

/** Translate a ViewConfig into `/api/v1` task-list query params. */
export function toTaskQuery(
  config: ViewConfig,
  ctx: { me?: string; projectId?: string },
): Record<string, string> {
  const q: Record<string, string> = {};
  if (ctx.projectId) q.projectId = ctx.projectId;

  for (const clause of config.filters) {
    if (clause.field === "assignee" && clause.op === "eq") {
      const v = clause.value === "@me" ? ctx.me : (clause.value as string | undefined);
      if (v) q.assigneeId = v;
    }
    if (clause.field === "status" && clause.op === "eq" && typeof clause.value === "string") {
      q.statusId = clause.value;
    }
    if (clause.field === "project" && clause.op === "eq" && typeof clause.value === "string") {
      q.projectId = clause.value;
    }
    if (clause.field === "triage") {
      // Pushed down to the API so the Inbox is a real query, not a
      // client-side reinterpretation of a bigger list.
      if (clause.op === "is_unset") q.inbox = "true";
      if (clause.op === "is_set") q.inbox = "false";
    }
  }
  return q;
}

/** Client-side predicate for filters the API does not push down yet. */
export function matchesClientFilters(
  task: {
    completedAt: string | null;
    dueDate: string | null;
    parentId: string | null;
    triagedAt?: string | null;
    labelIds?: string[];
  },
  config: ViewConfig,
  now: Date = new Date(),
): boolean {
  for (const c of config.filters) {
    if (c.field === "completed") {
      const want = c.value === "true";
      if (Boolean(task.completedAt) !== want) return false;
    }
    if (c.field === "parent" && c.op === "is_unset" && task.parentId) return false;
    if (c.field === "triage" && c.op === "is_unset" && task.triagedAt) return false;
    if (c.field === "triage" && c.op === "is_set" && !task.triagedAt) return false;
    if (c.field === "dueDate" && c.op === "before" && typeof c.value === "string") {
      if (!task.dueDate || new Date(task.dueDate) >= new Date(c.value)) return false;
    }
    if (c.field === "dueDate" && c.op === "before" && c.value === "@today") {
      if (!task.dueDate || new Date(task.dueDate) >= startOfDay(now)) return false;
    }
    if (c.field === "label" && c.op === "in" && Array.isArray(c.value)) {
      const has = (task.labelIds ?? []).some((l) => (c.value as string[]).includes(l));
      if (!has) return false;
    }
  }
  return true;
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
