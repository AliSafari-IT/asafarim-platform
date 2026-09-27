import { dependencyIssues, EFFORT_UNITS, type ActionPlan, type Dependency, type Effort, type PlanTask } from "./schema";

/**
 * Local review state for a generated action plan. Pure and browser-only:
 * nothing here is saved or sent anywhere. Every destructive or reordering
 * change pushes the previous state so it can be undone for the session.
 */

/** Where an item in the editor came from, kept for export. */
export type ItemOrigin = "ai" | "example" | "fixture" | "edited" | "added";

export interface EditableTask extends PlanTask {
  origin: ItemOrigin;
}
export interface EditableDependency extends Dependency {
  origin: ItemOrigin;
}

export interface PlanReviewState {
  /** In the user's chosen order. */
  tasks: EditableTask[];
  dependencies: EditableDependency[];
  selected: string[];
  /** Earlier states, newest last, for undo. */
  history: Omit<PlanReviewState, "history">[];
}

const HISTORY_LIMIT = 50;

export function initialReview(plan: ActionPlan, origin: ItemOrigin): PlanReviewState {
  return {
    tasks: plan.tasks.map((t) => ({ ...t, origin })),
    dependencies: plan.dependencies.map((d) => ({ ...d, origin })),
    selected: plan.tasks.map((t) => t.id),
    history: [],
  };
}

export interface TaskDraft {
  title: string;
  description: string;
  rationale: string;
  effortLow: string;
  effortHigh: string;
  effortUnit: Effort["unit"];
}

export function draftFrom(t: PlanTask): TaskDraft {
  return {
    title: t.title,
    description: t.description,
    rationale: t.rationale ?? "",
    effortLow: t.effort ? String(t.effort.low) : "",
    effortHigh: t.effort ? String(t.effort.high) : "",
    effortUnit: t.effort?.unit ?? "hours",
  };
}

export type ReviewAction =
  | { type: "toggle"; id: string }
  | { type: "select-all" }
  | { type: "select-none" }
  | { type: "move"; id: string; by: -1 | 1 }
  | { type: "save-task"; task: EditableTask }
  | { type: "remove-task"; id: string }
  | { type: "remove-dependency"; id: string }
  | { type: "add-dependency"; from: string; to: string }
  | { type: "undo" }
  | { type: "reset"; state: PlanReviewState };

export function reviewReducer(state: PlanReviewState, action: ReviewAction): PlanReviewState {
  const { history, ...current } = state;
  const commit = (next: Omit<PlanReviewState, "history">): PlanReviewState => ({ ...next, history: [...history, current].slice(-HISTORY_LIMIT) });

  switch (action.type) {
    case "toggle":
      return {
        ...state,
        selected: state.selected.includes(action.id) ? state.selected.filter((id) => id !== action.id) : [...state.selected, action.id],
      };
    case "select-all":
      return { ...state, selected: state.tasks.map((t) => t.id) };
    case "select-none":
      return { ...state, selected: [] };
    case "move": {
      const i = state.tasks.findIndex((t) => t.id === action.id);
      const j = i + action.by;
      if (i < 0 || j < 0 || j >= state.tasks.length) return state;
      const tasks = [...state.tasks];
      [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
      return commit({ ...current, tasks });
    }
    case "save-task":
      return commit({ ...current, tasks: state.tasks.map((t) => (t.id === action.task.id ? action.task : t)) });
    case "remove-task":
      // Its dependency edges go with it, so the plan never points at a missing task. Undo restores both.
      return commit({
        tasks: state.tasks.filter((t) => t.id !== action.id),
        dependencies: state.dependencies.filter((d) => d.from !== action.id && d.to !== action.id),
        selected: state.selected.filter((id) => id !== action.id),
      });
    case "remove-dependency":
      return commit({ ...current, dependencies: state.dependencies.filter((d) => d.id !== action.id) });
    case "add-dependency": {
      if (addDependencyError(state, action.from, action.to)) return state;
      const dependency: EditableDependency = {
        id: nextEdgeId(state.dependencies),
        from: action.from,
        to: action.to,
        reason: "Added by you during review.",
        basis: "recommendation",
        sourceIds: [],
        rationale: "Added by you during review.",
        origin: "added",
      };
      return commit({ ...current, dependencies: [...state.dependencies, dependency] });
    }
    case "reset":
      return action.state;
    case "undo": {
      const previous = history[history.length - 1];
      return previous ? { ...previous, history: history.slice(0, -1) } : state;
    }
  }
}

/** Why a new dependency can't be added, in words for the UI; null if it can. */
export function addDependencyError(state: Pick<PlanReviewState, "tasks" | "dependencies">, from: string, to: string): string | null {
  const ids = new Set(state.tasks.map((t) => t.id));
  const [issue] = dependencyIssues([...state.dependencies, { from, to }], ids).filter((i) => i.index === state.dependencies.length);
  if (!issue) return null;
  if (from === to) return "A task can't wait for itself.";
  if (issue.message.includes("twice")) return `${to} already waits for ${from}.`;
  if (issue.message.includes("cycle")) return `That would make a circular chain: ${from} already waits, directly or indirectly, for ${to}.`;
  return "Pick two tasks that are still in the plan.";
}

function nextEdgeId(edges: readonly Dependency[]): string {
  const max = edges.reduce((m, e) => Math.max(m, Number(e.id.slice(1)) || 0), 0);
  return `E${max + 1}`;
}

/**
 * Applies a user's edit. Keeps the task's id, basis, and evidence (a user
 * can't silently turn an inference into a fact), marks it as edited, and
 * enforces the output schema's limits.
 */
export function applyTaskEdit(task: EditableTask, draft: TaskDraft): { ok: true; task: EditableTask } | { ok: false; errors: string[] } {
  const needsRationale = task.basis === "inference" || task.basis === "recommendation";
  const low = draft.effortLow.trim() ? Number(draft.effortLow) : null;
  const high = draft.effortHigh.trim() ? Number(draft.effortHigh) : null;
  const hasEffort = low !== null || high !== null;
  const effortOk =
    !hasEffort ||
    (low !== null && high !== null && Number.isFinite(low) && Number.isFinite(high) && low > 0 && low <= high && high <= 1_000 && EFFORT_UNITS.includes(draft.effortUnit));
  const errors = [
    !draft.title.trim() && "Add a title.",
    needsRationale && !draft.rationale.trim() && (task.basis === "inference" ? "Inferred tasks need their assumption." : "Suggestions need their reason."),
    !effortOk && "Effort needs a low and a high number (low no bigger than high, up to 1,000), or leave both empty.",
  ].filter((e): e is string => Boolean(e));
  if (errors.length) return { ok: false, errors };

  const { rationale: _r, effort: _e, ...rest } = task;
  return {
    ok: true,
    task: {
      ...rest,
      title: draft.title.trim().slice(0, 300),
      description: draft.description.trim().slice(0, 1_000),
      ...(hasEffort ? { effort: { low: low!, high: high!, unit: draft.effortUnit } } : {}),
      ...(needsRationale ? { rationale: draft.rationale.trim().slice(0, 300) } : {}),
      origin: "edited",
    },
  };
}
