"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, EmptyState } from "@asafarim/ui";
import { api, ClientApiError, type StatusRow, type Task } from "../../lib/client/api";
import {
  DEFAULT_VIEWS,
  matchesClientFilters,
  toTaskQuery,
  type ViewType,
} from "../../lib/views/model";
import { measureView, track } from "../../lib/client/telemetry";
import { VIRTUALIZE_THRESHOLD } from "../../lib/ui/window";
import { copilotHref } from "../../lib/ai/workflow";
import { useWorkspace } from "../WorkspaceShell";
import { QuickAdd } from "./QuickAdd";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { VirtualList } from "./VirtualList";

const VIEW_TABS: { id: ViewType; label: string }[] = [
  { id: "list", label: "List" },
  { id: "board", label: "Board" },
  { id: "calendar", label: "Calendar" },
  { id: "timeline", label: "Timeline" },
];

export interface TaskWorkspaceProps {
  slug: string;
  me: string;
  /** When set, scope to one project and allow quick-add. */
  project?: { id: string; key: string; name: string };
  /**
   * Fixed non-project view. My Work and the Inbox have their own dedicated
   * surfaces now (components/tasks/MyWork.tsx, InboxTriage.tsx); this is the
   * generic saved-view escape hatch.
   */
  fixedView?: ViewType;
  heading: string;
  /**
   * Whether this viewer's role may assign and reschedule work. Guests can
   * read a project they belong to, so the detail drawer has to know not to
   * offer them planning controls the server will refuse.
   */
  canPlan: boolean;
}

export function TaskWorkspace({ slug, me, project, fixedView, heading, canPlan }: TaskWorkspaceProps) {
  const { aiEnabled } = useWorkspace();
  const [view, setView] = useState<ViewType>(fixedView ?? "list");
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Statuses (issue #387): fetched once per workspace and looked up by id
  // to render the board/list badges — the same `data-h` category-driven
  // styling the drawer already uses for check/dependency state.
  const [statuses, setStatuses] = useState<StatusRow[]>([]);

  useEffect(() => {
    let alive = true;
    void api
      .listStatuses(slug)
      .then((rows) => alive && setStatuses(rows))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [slug]);

  const config = useMemo(() => {
    const base = DEFAULT_VIEWS[view];
    return fixedView ? DEFAULT_VIEWS[fixedView] : base;
  }, [view, fixedView]);

  const load = useCallback(async () => {
    const done = measureView(config.type);
    try {
      const query = toTaskQuery(config, { me, projectId: project?.id });
      const rows = await api.listTasks(slug, query);
      setTasks(rows.filter((t) => matchesClientFilters(t, config)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tasks.");
    } finally {
      done();
    }
  }, [config, me, project?.id, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = useCallback(
    async (t: Task, body: Record<string, unknown>) => {
      // optimistic
      setTasks((cur) => cur?.map((x) => (x.id === t.id ? { ...x, ...body } : x)) ?? cur);
      try {
        await api.updateTask(slug, t.id, t.version, body);
        await load();
      } catch (err) {
        if (err instanceof ClientApiError && err.code === "conflict_version") await load();
        else setError(err instanceof Error ? err.message : "Update failed.");
      }
    },
    [slug, load],
  );

  const complete = useCallback(
    async (t: Task) => {
      setTasks((cur) => cur?.map((x) => (x.id === t.id ? { ...x, completedAt: new Date().toISOString() } : x)) ?? cur);
      try {
        await api.completeTask(slug, t.id);
        track({ name: "task.completed" });
        await load();
      } catch {
        await load();
      }
    },
    [slug, load],
  );

  return (
    <section className="ta-tw">
      <header className="ta-tw__head">
        <div>
          {project && (
            // Preserves parent context on a sub-route (issue #369): the
            // project name alone in the <h1> doesn't say it's a project.
            <nav className="ta-tw__crumb" aria-label="Breadcrumb">
              <a href={`/w/${slug}/projects`}>Projects</a>
              <span aria-hidden="true"> / </span>
              <span aria-current="page">
                {project.key} · {project.name}
              </span>
            </nav>
          )}
          <h1>{heading}</h1>
        </div>
        {!fixedView && (
          <div className="ta-tw__tabs" role="tablist" aria-label="View">
            {VIEW_TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={view === tab.id}
                onClick={() => setView(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {project && (
        <QuickAdd
          onAdd={async (title) => {
            const created = await api.createTask(slug, {
              projectId: project.id,
              title,
              source: "quick_capture",
            });
            track({ name: "task.created", source: "quick_capture" });
            setTasks((cur) => (cur ? [...cur, created] : [created]));
          }}
        />
      )}

      {error && <p className="ta-error" role="alert">{error}</p>}

      {tasks === null ? (
        <p className="ta-muted">Loading…</p>
      ) : tasks.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          description={
            project
              ? aiEnabled
                ? "Add your first task above — or start from something you already wrote and review the tasks TasksAI drafts from it. Nothing is created until you approve it."
                : "Add your first task above, or import a list you already keep."
              : "No tasks match this view."
          }
          action={
            project && aiEnabled ? (
              <span className="ta-tw__headactions">
                <a
                  className="ta-link"
                  href={copilotHref(slug, { intent: "extract_plan", from: "project_empty" })}
                >
                  Turn a brief into a plan
                </a>
                <a className="ta-link" href={`/w/${slug}/imports`}>
                  Import a task list
                </a>
              </span>
            ) : undefined
          }
        />
      ) : view === "board" ? (
        <BoardView tasks={tasks} statuses={statuses} onOpen={setSelected} onComplete={complete} />
      ) : view === "calendar" || view === "timeline" ? (
        <DateView tasks={tasks} onOpen={setSelected} />
      ) : (
        <ListView tasks={tasks} statuses={statuses} onOpen={setSelected} onComplete={complete} />
      )}

      {selected && (
        <TaskDetailPanel
          slug={slug}
          taskId={selected}
          canPlan={canPlan}
          onClose={() => setSelected(null)}
          onChanged={load}
          onOpenTask={setSelected}
        />
      )}
    </section>
  );
}

/** Status name + category-driven `data-h` badge (issue #387) — `undefined`
 * for a task with no statusId, or one whose status was archived after the
 * task last saw it. Renders nothing rather than a stale/blank chip. */
function StatusBadge({ statusId, statuses }: { statusId: string | null; statuses: StatusRow[] }) {
  const status = statusId ? statuses.find((s) => s.id === statusId) : undefined;
  if (!status) return null;
  return (
    <span className="ta-badge" data-h={status.category}>
      {status.name}
    </span>
  );
}

function ListRow({
  t,
  statuses,
  onOpen,
  onComplete,
}: {
  t: Task;
  statuses: StatusRow[];
  onOpen: (id: string) => void;
  onComplete: (t: Task) => void;
}) {
  return (
    <div className="ta-list__row" data-done={Boolean(t.completedAt)}>
      <input
        type="checkbox"
        checked={Boolean(t.completedAt)}
        onChange={() => onComplete(t)}
        aria-label={`Complete ${t.title}`}
        disabled={Boolean(t.completedAt)}
      />
      <button className="ta-list__title" onClick={() => onOpen(t.id)}>
        {t.title}
      </button>
      <StatusBadge statusId={t.statusId} statuses={statuses} />
      {t.dueDate && <span className="ta-list__due">{fmtDate(t.dueDate)}</span>}
    </div>
  );
}

function ListView({
  tasks,
  statuses,
  onOpen,
  onComplete,
}: {
  tasks: Task[];
  statuses: StatusRow[];
  onOpen: (id: string) => void;
  onComplete: (t: Task) => void;
}) {
  // Windowed rendering keeps large lists cheap (docs/performance-budgets.md).
  if (tasks.length > VIRTUALIZE_THRESHOLD) {
    return (
      <VirtualList
        items={tasks}
        rowHeight={40}
        ariaLabel="Tasks"
        renderRow={(t) => <ListRow t={t} statuses={statuses} onOpen={onOpen} onComplete={onComplete} />}
      />
    );
  }
  return (
    <ul className="ta-list">
      {tasks.map((t) => (
        <li key={t.id}>
          <ListRow t={t} statuses={statuses} onOpen={onOpen} onComplete={onComplete} />
        </li>
      ))}
    </ul>
  );
}

function BoardView({
  tasks,
  statuses,
  onOpen,
  onComplete,
}: {
  tasks: Task[];
  statuses: StatusRow[];
  onOpen: (id: string) => void;
  onComplete: (t: Task) => void;
}) {
  const columns: { key: string; label: string; items: Task[] }[] = [
    { key: "open", label: "Open", items: tasks.filter((t) => !t.completedAt) },
    { key: "done", label: "Done", items: tasks.filter((t) => t.completedAt) },
  ];
  return (
    <div className="ta-board">
      {columns.map((col) => (
        <div key={col.key} className="ta-board__col">
          <h3>
            {col.label} <span>{col.items.length}</span>
          </h3>
          <ul>
            {col.items.map((t) => (
              <li key={t.id}>
                <button onClick={() => onOpen(t.id)}>{t.title}</button>
                <StatusBadge statusId={t.statusId} statuses={statuses} />
                {!t.completedAt && (
                  <Button size="sm" variant="secondary" onClick={() => onComplete(t)}>
                    Done
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function DateView({ tasks, onOpen }: { tasks: Task[]; onOpen: (id: string) => void }) {
  const withDates = tasks
    .filter((t) => t.dueDate)
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1));
  const undated = tasks.filter((t) => !t.dueDate);
  return (
    <div className="ta-dateview">
      <ol>
        {withDates.map((t) => (
          <li key={t.id}>
            <time dateTime={t.dueDate!}>{fmtDate(t.dueDate!)}</time>
            <button onClick={() => onOpen(t.id)}>{t.title}</button>
          </li>
        ))}
      </ol>
      {undated.length > 0 && (
        <p className="ta-muted">{undated.length} task(s) without a due date are not shown here.</p>
      )}
    </div>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
