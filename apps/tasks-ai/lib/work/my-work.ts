/**
 * The My Work planning model (issue #367).
 *
 * My Work is the user's cross-project *execution* surface: "everything I am
 * responsible for, organized so I know what to do next". It is deliberately
 * not the Inbox (work that still needs triage), not Projects (team context),
 * and not Focus (the explainable prioritization layer). Focus ranks and
 * explains; My Work lists and groups. Keeping the two apart is why this
 * module contains no scoring — only time/risk state a person can verify at a
 * glance.
 *
 * Pure and framework-free on purpose: the grouping, the sorting, the summary
 * line, and the empty-state copy are all decided here so they are unit
 * testable and identical on the server and in the client component.
 */

/** Which planning bucket a row belongs to. Order is the render order. */
export type MyWorkGroupId = "overdue" | "today" | "blocked" | "upcoming" | "undated";

export const MY_WORK_GROUP_ORDER: MyWorkGroupId[] = [
  "overdue",
  "today",
  "blocked",
  "upcoming",
  "undated",
];

/**
 * One row of My Work: the task plus the cross-project context the view
 * promises. `projectKey` is load-bearing — two identically titled tasks from
 * different projects have to be distinguishable (issue #367, requirement 7).
 */
export interface MyWorkItem {
  id: string;
  title: string;
  projectId: string;
  projectKey: string;
  projectName: string;
  /** True while the task still sits in the workspace Inbox container. */
  projectIsInbox: boolean;
  statusName: string | null;
  /** todo | in_progress | done | canceled — the workspace's own vocabulary. */
  statusCategory: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  completedAt: string | null;
  /** Open tasks that block this one. > 0 means the row is waiting. */
  blockedBy: number;
  /** Open tasks this one blocks — why finishing it matters to somebody else. */
  blocks: number;
  labels: string[];
  position: number;
  updatedAt: string;
  version: number;
}

export interface MyWorkGroup {
  id: MyWorkGroupId;
  title: string;
  /** One plain sentence saying what this section means. */
  description: string;
  items: MyWorkItem[];
}

const GROUP_COPY: Record<MyWorkGroupId, { title: string; description: string }> = {
  overdue: {
    title: "Overdue",
    description: "Past its date. Finish it, or move the date so the plan tells the truth.",
  },
  today: {
    title: "Today",
    description: "Due today — the realistic shape of the day.",
  },
  blocked: {
    title: "Blocked",
    description:
      "Waiting on another task. Nothing here is due today or overdue — those stay in their date section and are badged instead.",
  },
  upcoming: {
    title: "Upcoming",
    description: "Dated, not yet due. Nearest first.",
  },
  undated: {
    title: "No due date",
    description: "Yours, but unplanned. Give it a date or it will never compete for a day.",
  },
};

/**
 * Due dates are stored as UTC calendar midnights (an HTML date input parsed
 * with `new Date("YYYY-MM-DD")`), so every boundary here is a UTC midnight
 * too — server-local midnight plus 24h misclassifies on non-UTC servers and
 * across DST. Same convention as lib/home/service.ts.
 */
export function utcMidnight(now: Date, dayOffset = 0): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset));
}

/**
 * The bucket for one item. Every open task lands in exactly one group — the
 * view must never show the same task twice (issue #367, requirement 1).
 *
 * Time pressure wins over waiting: an overdue or due-today task that happens
 * to be blocked stays in its date section (badged "Blocked") rather than
 * disappearing into a section a person reads as "not my problem today".
 * Blocked therefore collects the *undated and future* work that is waiting,
 * which is exactly the work that would otherwise look actionable and is not.
 */
export function groupIdFor(item: MyWorkItem, now: Date = new Date()): MyWorkGroupId {
  const today = utcMidnight(now);
  const tomorrow = utcMidnight(now, 1);
  const due = item.dueDate ? new Date(item.dueDate) : null;
  const overdue = due !== null && due < today;
  const dueToday = due !== null && due >= today && due < tomorrow;

  if (overdue) return "overdue";
  if (dueToday) return "today";
  if (item.blockedBy > 0) return "blocked";
  if (due === null) return "undated";
  return "upcoming";
}

function time(iso: string | null): number {
  return iso ? new Date(iso).getTime() : Number.NaN;
}

/**
 * Deterministic ordering inside a group (issue #367, "Sorting"). Every
 * comparator ends on `id` so an unrelated update can never make rows swap
 * places — stable rendering is the whole point of a list you plan a day from.
 */
export function sortWithinGroup(group: MyWorkGroupId, items: MyWorkItem[]): MyWorkItem[] {
  const byId = (a: MyWorkItem, b: MyWorkItem) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const byPosition = (a: MyWorkItem, b: MyWorkItem) =>
    a.position - b.position || byId(a, b);
  const byDue = (a: MyWorkItem, b: MyWorkItem) => {
    const ta = time(a.dueDate);
    const tb = time(b.dueDate);
    // Undated last, so a dateless straggler never leads a dated section.
    if (Number.isNaN(ta) && Number.isNaN(tb)) return byPosition(a, b);
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return ta - tb || byPosition(a, b);
  };

  const sorted = [...items];
  if (group === "undated") {
    // Recently touched first: the thing you were just thinking about is the
    // thing you are most likely to schedule.
    sorted.sort((a, b) => time(b.updatedAt) - time(a.updatedAt) || byPosition(a, b));
  } else {
    // Overdue: oldest first. Today / Upcoming / Blocked: nearest first. Both
    // are ascending by due date — the difference is only which dates are in
    // the bucket.
    sorted.sort(byDue);
  }
  return sorted;
}

/** Group + sort a flat list of My Work rows. Empty groups are dropped. */
export function groupMyWork(items: MyWorkItem[], now: Date = new Date()): MyWorkGroup[] {
  const buckets = new Map<MyWorkGroupId, MyWorkItem[]>();
  for (const item of items) {
    // A completed row is not active work; it leaves the sections the moment
    // it is ticked rather than lingering as stale state.
    if (item.completedAt) continue;
    const id = groupIdFor(item, now);
    const bucket = buckets.get(id);
    if (bucket) bucket.push(item);
    else buckets.set(id, [item]);
  }
  return MY_WORK_GROUP_ORDER.filter((id) => (buckets.get(id)?.length ?? 0) > 0).map((id) => ({
    id,
    ...GROUP_COPY[id],
    items: sortWithinGroup(id, buckets.get(id) ?? []),
  }));
}

export interface MyWorkSummary {
  overdue: number;
  today: number;
  blocked: number;
  upcoming: number;
  undated: number;
  total: number;
}

export function summarize(items: MyWorkItem[], now: Date = new Date()): MyWorkSummary {
  const summary: MyWorkSummary = {
    overdue: 0,
    today: 0,
    blocked: 0,
    upcoming: 0,
    undated: 0,
    total: 0,
  };
  for (const item of items) {
    if (item.completedAt) continue;
    summary[groupIdFor(item, now)] += 1;
    summary.total += 1;
  }
  return summary;
}

/**
 * The compact header line — "2 overdue · 3 due today · 7 upcoming". It is a
 * count of what is on screen, not an analytics panel: Analytics owns trends,
 * this owns "what does my day look like" (issue #367, requirement 5).
 */
export function summaryLine(summary: MyWorkSummary): string {
  const parts: string[] = [];
  if (summary.overdue > 0) parts.push(`${summary.overdue} overdue`);
  if (summary.today > 0) parts.push(`${summary.today} due today`);
  if (summary.blocked > 0) parts.push(`${summary.blocked} blocked`);
  if (summary.upcoming > 0) parts.push(`${summary.upcoming} upcoming`);
  if (summary.undated > 0) parts.push(`${summary.undated} with no date`);
  if (parts.length === 0) return "Nothing open is assigned to you.";
  return parts.join(" · ");
}

// ──────────────────────────────────────────────────────────────────────
// Empty states
// ──────────────────────────────────────────────────────────────────────

/**
 * "No tasks match the view" is the one answer this page may never give. The
 * three empty conditions mean different things and deserve different
 * guidance (issue #367, requirement 4).
 */
export type MyWorkEmptyKind =
  /** Nothing has ever been assigned to this person. */
  | "nothing_assigned"
  /** Everything assigned is finished — a good state, not an error. */
  | "all_done"
  /** Work exists in the workspace, but nobody owns it yet. */
  | "unowned_work_exists";

/** An action the empty state offers. The component maps ids to links/buttons. */
export type MyWorkEmptyAction = "capture" | "projects" | "inbox" | "focus";

export interface MyWorkEmptyState {
  kind: MyWorkEmptyKind;
  title: string;
  description: string;
  actions: MyWorkEmptyAction[];
  /** Positive states must not be dressed up as problems. */
  tone: "neutral" | "positive";
}

export interface MyWorkContextCounts {
  /** Open, triaged tasks assigned to the viewer (what the list renders). */
  assignedOpen: number;
  /** Tasks assigned to the viewer that are already done. */
  assignedCompleted: number;
  /** Open tasks anywhere in the workspace the viewer can see. */
  workspaceOpen: number;
  /** Open tasks nobody owns — the distinction people trip over. */
  workspaceUnowned: number;
  /** Untriaged captures waiting in the Inbox. */
  inboxWaiting: number;
  /** Whether this viewer's role may assign and reschedule work. */
  canPlan: boolean;
}

/**
 * Which empty state to show, or `null` when the list has rows.
 *
 * `capture` is only ever offered to a viewer who may actually create work:
 * a guest's capture dialog refuses to open, so offering it would be a dead
 * control in the one place the user has nothing else to do.
 */
export function emptyStateFor(counts: MyWorkContextCounts): MyWorkEmptyState | null {
  if (counts.assignedOpen > 0) return null;
  const capture: MyWorkEmptyAction[] = counts.canPlan ? ["capture"] : [];

  if (counts.assignedCompleted > 0) {
    return {
      kind: "all_done",
      title: "You are clear",
      description:
        "Everything assigned to you is finished. Nothing is overdue and nothing is waiting — pick up what is next when you are ready.",
      actions: counts.workspaceUnowned > 0 || counts.inboxWaiting > 0
        ? ["projects", "inbox", ...capture]
        : ["projects", ...capture],
      tone: "positive",
    };
  }

  if (counts.workspaceUnowned > 0 || counts.workspaceOpen > 0) {
    return {
      kind: "unowned_work_exists",
      title: "There is work here, but none of it is yours",
      description:
        counts.workspaceUnowned > 0
          ? `My Work lists only what is assigned to you. ${counts.workspaceUnowned} open task(s) in this workspace have no owner yet — take one, or triage the Inbox to give captured work an owner.`
          : "My Work lists only what is assigned to you. The open work in this workspace currently belongs to other people.",
      actions: counts.canPlan ? ["projects", "inbox", "capture"] : ["projects", "inbox"],
      tone: "neutral",
    };
  }

  return {
    kind: "nothing_assigned",
    title: "Nothing is assigned to you yet",
    description:
      "My Work is your cross-project list of everything you are responsible for. Capture what you are working on, or pick something up from a project.",
    actions: [...capture, "projects"],
    tone: "neutral",
  };
}

// ──────────────────────────────────────────────────────────────────────
// Quick planning actions
// ──────────────────────────────────────────────────────────────────────

/** The date shortcuts My Work offers from a row. */
export type PlanShortcut = "today" | "tomorrow" | "next_week" | "clear";

export const PLAN_SHORTCUT_LABEL: Record<PlanShortcut, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  next_week: "Next week",
  clear: "No date",
};

/**
 * The ISO instant a shortcut means. UTC midnight, matching how a date typed
 * into the detail drawer is stored — so a task moved to "today" from My Work
 * and a task dated today in the drawer land in the same group.
 */
export function planShortcutDate(shortcut: PlanShortcut, now: Date = new Date()): string | null {
  switch (shortcut) {
    case "today":
      return utcMidnight(now).toISOString();
    case "tomorrow":
      return utcMidnight(now, 1).toISOString();
    case "next_week":
      return utcMidnight(now, 7).toISOString();
    case "clear":
    default:
      return null;
  }
}

/** Short, human due-state label for a row ("Overdue by 3 days", "Today"). */
export function dueLabel(item: MyWorkItem, now: Date = new Date()): string {
  if (!item.dueDate) return "No date";
  const today = utcMidnight(now);
  const due = new Date(item.dueDate);
  const days = Math.round((utcMidnight(due).getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days < 0) return `${Math.abs(days)} days late`;
  return `In ${days} days`;
}
