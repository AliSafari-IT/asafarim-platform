"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { Button, EmptyState } from "@asafarim/ui";
import { api, ClientApiError, type MyWorkMeta } from "../../lib/client/api";
import {
  dueLabel,
  emptyStateFor,
  groupMyWork,
  planShortcutDate,
  summaryLine,
  PLAN_SHORTCUT_LABEL,
  type MyWorkContextCounts,
  type MyWorkEmptyAction,
  type MyWorkGroupId,
  type MyWorkItem,
  type MyWorkSummary,
  type PlanShortcut,
} from "../../lib/work/my-work";
import { measureView, track } from "../../lib/client/telemetry";
import { VIRTUALIZE_THRESHOLD } from "../../lib/ui/window";
import { useCapture } from "../capture/CaptureDialog";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { VirtualList, type VirtualListHandle } from "./VirtualList";

/**
 * My Work — the cross-project daily execution view (issue #367).
 *
 * The mental model this screen has to deliver: *everything I am responsible
 * for, organized so I know what to do next*. So it groups by planning state
 * (overdue / today / blocked / upcoming / undated), shows enough context per
 * row to tell two same-named tasks from different projects apart, and puts
 * the planning actions on the row instead of behind a detail drawer.
 *
 * What it deliberately does not do is rank. Focus is the explainable
 * prioritization layer and stays a separate page — My Work links to it
 * rather than quietly folding its scoring in, so the user always knows
 * whether they are reading their own list or a machine's opinion.
 *
 * Keyboard (same grammar as Inbox triage):
 *   j / ↓  next row        Enter  open details
 *   k / ↑  previous row    c      complete
 *   t      due today       m      due tomorrow    w  due next week
 *   a      assign to me    u      unassign        p  open the project
 */
const KEY_HINTS =
  "j/k move · c complete · t today · m tomorrow · w next week · a assign to me · u unassign · p project · Enter details";

/** One screenful. More arrives on demand — never a silent cap. */
const PAGE_SIZE = 50;
/** Rows past this many in one section switch to windowed rendering. */
const ROW_HEIGHT = 76;

export function MyWork({ slug, me, role }: { slug: string; me: string; role: string }) {
  const capture = useCapture();
  const canPlan = role !== "guest";
  const [items, setItems] = useState<MyWorkItem[] | null>(null);
  // Loading is tracked apart from the data: a failed first load leaves
  // `items` null forever, and using null as the loading sentinel would then
  // render "Loading…" under the error message with no way back.
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<MyWorkMeta | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Bumped by every refresh, so a page fetched from a cursor into the *old*
  // list is discarded rather than appended to the new one.
  const generation = useRef(0);

  const load = useCallback(async () => {
    const done = measureView("my_work");
    const gen = (generation.current += 1);
    setLoading(true);
    try {
      const first = await api.myWork(slug, { limit: String(PAGE_SIZE) });
      if (generation.current !== gen) return;
      setItems(first.items);
      setMeta(first.meta);
      setNextCursor(first.nextCursor);
      setCursor((c) => Math.min(c, Math.max(first.items.length - 1, 0)));
      setError(null);
    } catch (err) {
      if (generation.current !== gen) return;
      setError(err instanceof Error ? err.message : "Could not load your work.");
    } finally {
      if (generation.current === gen) setLoading(false);
      done();
    }
  }, [slug]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const gen = generation.current;
    const from = nextCursor;
    setLoadingMore(true);
    try {
      const more = await api.myWork(slug, { limit: String(PAGE_SIZE), cursor: from });
      if (generation.current !== gen) return;
      setItems((cur) => [...(cur ?? []), ...more.items]);
      setNextCursor(more.nextCursor);
    } catch (err) {
      if (generation.current !== gen) return;
      setError(err instanceof Error ? err.message : "Could not load more work.");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextCursor, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  // A capture may well be work for me; the dialog's router.refresh() does
  // not reach this client-held state.
  useEffect(() => capture.onCaptured(() => void load()), [capture, load]);

  // Activation funnel (issue #365): reaching My Work is the step the
  // workspace home routes people toward.
  const seen = useRef(false);
  useEffect(() => {
    if (seen.current) return;
    seen.current = true;
    track({ name: "workspace.activation.my_work_opened" });
  }, []);

  // Grouping happens over everything loaded so far, never per page — a
  // section is only meaningful if it holds every row that belongs in it.
  const groups = useMemo(() => groupMyWork(items ?? []), [items]);
  /**
   * The summary comes from the server and covers *everything* assigned to
   * me, not just the pages loaded so far — "3 overdue" has to mean three
   * overdue tasks exist. Recomputing it from the rendered rows would quietly
   * undercount the moment the list runs past one page.
   */
  const summary: MyWorkSummary | null = meta?.summary ?? null;
  /** The rows in render order — what j/k walks. */
  const ordered = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  const reportedSummary = useRef(false);
  useEffect(() => {
    if (items === null || summary === null || reportedSummary.current) return;
    reportedSummary.current = true;
    track({
      name: "my_work.viewed",
      overdue: summary.overdue,
      today: summary.today,
      upcoming: summary.upcoming,
      blocked: summary.blocked,
      undated: summary.undated,
    });
  }, [items, summary]);

  const plan = useCallback(
    async (item: MyWorkItem, body: Record<string, unknown>, action: string) => {
      setBusyId(item.id);
      // Optimistic: the row moves to its new section immediately, so a date
      // change never leaves a task sitting in a section it no longer belongs
      // to while the request is in flight.
      setItems((cur) => cur?.map((t) => (t.id === item.id ? { ...t, ...body } : t)) ?? cur);
      try {
        await api.planTask(slug, item.id, body, item.version);
        track({ name: "my_work.action", action });
        await load();
      } catch (err) {
        const message =
          err instanceof ClientApiError && err.code === "forbidden"
            ? "Your role cannot plan work in this workspace."
            : err instanceof ClientApiError && err.code === "conflict_version"
              ? "Somebody else changed that task. It has been reloaded — try again."
              : err instanceof Error
                ? err.message
                : "Could not update that task.";
        // Reload first: load() clears the error on success, so the message
        // has to be set after it or it only flashes.
        await load();
        setError(message);
      } finally {
        setBusyId(null);
      }
    },
    [load, slug],
  );

  const complete = useCallback(
    async (item: MyWorkItem) => {
      // A completed task leaves the active sections at once — no stale row
      // sitting in Overdue with a ticked box.
      setItems((cur) => cur?.filter((t) => t.id !== item.id) ?? cur);
      try {
        await api.completeTask(slug, item.id);
        track({ name: "my_work.action", action: "complete" });
        track({ name: "task.completed" });
        await load();
      } catch (err) {
        const message =
          err instanceof ClientApiError && err.code === "blocked_by_check"
            ? "That task has an unsatisfied check — open it to see what is blocking completion."
            : err instanceof Error
              ? err.message
              : "Could not complete that task.";
        await load();
        setError(message);
      }
    },
    [load, slug],
  );

  const reschedule = useCallback(
    (item: MyWorkItem, shortcut: PlanShortcut) =>
      plan(item, { dueDate: planShortcutDate(shortcut) }, `due_${shortcut}`),
    [plan],
  );

  // ── Keeping the active row on screen ────────────────────────────────
  // The cursor is also moved by hovering a row, and scrolling *then* would
  // fight the mouse. Only a key press asks for the row to be brought into
  // view, so the request is explicit.
  const rowNodes = useRef(new Map<string, HTMLDivElement>());
  const windows = useRef(new Map<MyWorkGroupId, MutableRefObject<VirtualListHandle | null>>());
  const scrollWanted = useRef(false);
  const moveCursor = useCallback((next: (c: number) => number) => {
    scrollWanted.current = true;
    setCursor(next);
  }, []);

  useEffect(() => {
    if (!scrollWanted.current) return;
    scrollWanted.current = false;
    const item = ordered[cursor];
    if (!item) return;

    // A windowed section has to move its window first: until it does, the
    // row is not in the DOM at all and there is nothing to scroll to.
    for (const group of groups) {
      const index = group.items.indexOf(item);
      if (index === -1) continue;
      windows.current.get(group.id)?.current?.scrollToIndex(index);
      break;
    }
    // Then the page itself, once React has painted the row.
    const frame = requestAnimationFrame(() => {
      rowNodes.current.get(item.id)?.scrollIntoView?.({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [cursor, groups, ordered]);

  // Global keys. Typing in a field always wins — nothing here hijacks input.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        selected ||
        ordered.length === 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        (target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable))
      ) {
        return;
      }
      const item = ordered[Math.min(cursor, ordered.length - 1)];
      if (!item) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        moveCursor((c) => Math.min(c + 1, ordered.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        moveCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        setSelected(item.id);
      } else if (e.key === "p") {
        e.preventDefault();
        window.location.href = `/w/${slug}/projects/${item.projectKey}`;
      } else if (!canPlan) {
        return;
      } else if (e.key === "c") {
        e.preventDefault();
        void complete(item);
      } else if (e.key === "t" || e.key === "m" || e.key === "w") {
        e.preventDefault();
        void reschedule(item, e.key === "t" ? "today" : e.key === "m" ? "tomorrow" : "next_week");
      } else if (e.key === "a") {
        e.preventDefault();
        void plan(item, { assigneeId: me }, "assign_to_me");
      } else if (e.key === "u") {
        e.preventDefault();
        void plan(item, { assigneeId: null }, "unassign");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canPlan, complete, cursor, me, moveCursor, ordered, plan, reschedule, selected, slug]);

  const counts: MyWorkContextCounts | null = meta?.counts ?? null;
  const empty = items !== null && ordered.length === 0 && counts ? emptyStateFor(counts) : null;

  const emptyReported = useRef<string | null>(null);
  useEffect(() => {
    if (!empty || emptyReported.current === empty.kind) return;
    emptyReported.current = empty.kind;
    track({ name: "my_work.empty", kind: empty.kind });
  }, [empty]);

  return (
    <section className="ta-tw ta-mywork">
      <header className="ta-tw__head">
        <div>
          <h1>My Work</h1>
          <p className="ta-hint">
            Everything assigned to you, across every project, grouped by what it needs from you
            today. The Inbox holds work that still needs organizing; Focus explains what deserves
            attention first.
          </p>
        </div>
        <span className="ta-tw__headactions">
          {/* A guest's capture dialog refuses to open, so they never get the
              button rather than a control that silently does nothing. */}
          {capture.canCapture && (
            <Button size="sm" onClick={() => capture.open("", "my_work")}>
              Capture task
            </Button>
          )}
          <a
            className="ta-link"
            href={`/w/${slug}/focus`}
            onClick={() => track({ name: "my_work.focus_opened" })}
          >
            Need help prioritizing? Open Focus
          </a>
        </span>
      </header>

      {items !== null && summary !== null && ordered.length > 0 && (
        <p className="ta-mywork__summary" aria-live="polite">
          <strong>{summaryLine(summary)}</strong>
          {nextCursor && <span className="ta-muted"> · not all rows are loaded yet</span>}
        </p>
      )}

      {error && (
        <p className="ta-error" role="alert">
          {error}
        </p>
      )}

      {loading && items === null ? (
        <p className="ta-muted">Loading…</p>
      ) : items === null ? (
        // The load finished and left us with nothing: a failure, not a state
        // to sit in. Say so, and offer the way out.
        <EmptyState
          title="Your work could not be loaded"
          description="The request failed before anything could be shown. Nothing has been changed — try again."
          action={
            <Button size="sm" onClick={() => void load()}>
              Try again
            </Button>
          }
        />
      ) : empty ? (
        <EmptyState
          title={empty.title}
          description={empty.description}
          action={
            <span className="ta-tw__headactions">
              {empty.actions.map((action) => (
                <EmptyAction
                  key={action}
                  action={action}
                  slug={slug}
                  onCapture={() => capture.open("", "my_work_empty")}
                />
              ))}
            </span>
          }
        />
      ) : (
        <>
          <p className="ta-hint ta-mywork__keys">{KEY_HINTS}</p>
          {groups.map((group) => {
            const offset = ordered.indexOf(group.items[0]);
            // Windowed sections position every row at exactly ROW_HEIGHT, so
            // those rows must actually be that tall — see `fixed` on Row.
            const virtualized = group.items.length > VIRTUALIZE_THRESHOLD;
            const renderRow = (item: MyWorkItem, i: number) => (
              <Row
                key={item.id}
                item={item}
                slug={slug}
                me={me}
                canPlan={canPlan}
                fixed={virtualized}
                active={offset + i === cursor}
                busy={busyId === item.id}
                nodeRef={(el) => {
                  if (el) rowNodes.current.set(item.id, el);
                  else rowNodes.current.delete(item.id);
                }}
                onFocusRow={() => setCursor(offset + i)}
                onOpen={() => setSelected(item.id)}
                onComplete={() => void complete(item)}
                onReschedule={(s) => void reschedule(item, s)}
                onSetDue={(iso) => void plan(item, { dueDate: iso }, "due_picked")}
                onAssign={(assigneeId) =>
                  void plan(item, { assigneeId }, assigneeId ? "assign_to_me" : "unassign")
                }
              />
            );
            return (
              <section key={group.id} className="ta-mywork__group" data-group={group.id}>
                <h2>
                  {group.title} <span className="ta-badge">{group.items.length}</span>
                </h2>
                <p className="ta-hint">{group.description}</p>
                {virtualized ? (
                  // Windowed rendering keeps very large sections cheap
                  // (docs/performance-budgets.md).
                  <VirtualList
                    items={group.items}
                    rowHeight={ROW_HEIGHT}
                    ariaLabel={group.title}
                    // Keyboard navigation needs to move this window before
                    // an off-screen row can be scrolled to — it is not in
                    // the DOM until the window includes it.
                    handleRef={virtualWindowRef(windows.current, group.id)}
                    renderRow={(item, i) => renderRow(item, i)}
                  />
                ) : (
                  <ul className="ta-mywork__list">
                    {group.items.map((item, i) => (
                      <li key={item.id}>{renderRow(item, i)}</li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
          {nextCursor && (
            <Button
              size="sm"
              variant="secondary"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? "Loading…" : "Load more of my work"}
            </Button>
          )}
          {!canPlan && (
            <p className="ta-hint">
              You can read your work here, but changing owners and dates needs a member role.
            </p>
          )}
        </>
      )}

      {selected && (
        <TaskDetailPanel
          slug={slug}
          taskId={selected}
          canPlan={canPlan}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </section>
  );
}

/**
 * A stable ref object per group, so a windowed section keeps the same handle
 * slot across renders — a fresh object each render would leave the effect
 * reading a ref nothing ever filled.
 */
function virtualWindowRef(
  store: Map<MyWorkGroupId, MutableRefObject<VirtualListHandle | null>>,
  group: MyWorkGroupId,
): MutableRefObject<VirtualListHandle | null> {
  const existing = store.get(group);
  if (existing) return existing;
  const created: MutableRefObject<VirtualListHandle | null> = { current: null };
  store.set(group, created);
  return created;
}

function EmptyAction({
  action,
  slug,
  onCapture,
}: {
  action: MyWorkEmptyAction;
  slug: string;
  onCapture: () => void;
}) {
  if (action === "capture") {
    return (
      <Button size="sm" onClick={onCapture}>
        Capture a task
      </Button>
    );
  }
  const href =
    action === "projects" ? `/w/${slug}/projects` : action === "inbox" ? `/w/${slug}/inbox` : `/w/${slug}/focus`;
  const label =
    action === "projects" ? "Browse projects" : action === "inbox" ? "Open the Inbox" : "Open Focus";
  return (
    <a className="ta-link" href={href}>
      {label}
    </a>
  );
}

/**
 * One row. Desktop gets the full metadata line; on narrow screens the same
 * information stacks rather than disappearing — a mobile row must still say
 * which project the task is in, what state its date is in, and offer
 * completion and details (issue #367, "Responsive UX").
 *
 * `fixed` is the exception, and only inside a windowed section: the
 * virtualizer places rows at a constant ROW_HEIGHT, so a wrapping row would
 * paint over the next task. A fixed row therefore stays exactly one line
 * tall — labels collapse to "+N", the metadata truncates with an ellipsis,
 * the actions scroll sideways — and nothing is lost, because the full row is
 * one click away in the detail drawer.
 */
function Row({
  item,
  slug,
  me,
  canPlan,
  fixed = false,
  active,
  busy,
  nodeRef,
  onFocusRow,
  onOpen,
  onComplete,
  onReschedule,
  onSetDue,
  onAssign,
}: {
  item: MyWorkItem;
  slug: string;
  me: string;
  canPlan: boolean;
  /** Keep the row exactly ROW_HEIGHT tall — required inside a VirtualList. */
  fixed?: boolean;
  active: boolean;
  busy: boolean;
  /** Registers the row's element so keyboard navigation can scroll to it. */
  nodeRef?: (el: HTMLDivElement | null) => void;
  onFocusRow: () => void;
  onOpen: () => void;
  onComplete: () => void;
  onReschedule: (shortcut: PlanShortcut) => void;
  onSetDue: (iso: string | null) => void;
  onAssign: (assigneeId: string | null) => void;
}) {
  const mine = item.assigneeId === me;
  // In a fixed row only the first couple of labels fit; the rest become a
  // "+N" badge that names them in its tooltip rather than wrapping.
  const shownLabels = fixed ? item.labels.slice(0, 2) : item.labels;
  const hiddenLabels = item.labels.length - shownLabels.length;
  return (
    <div
      className="ta-mywork__row"
      ref={nodeRef}
      data-fixed={fixed || undefined}
      data-active={active}
      aria-busy={busy}
      onMouseEnter={onFocusRow}
      onFocus={onFocusRow}
    >
      <input
        type="checkbox"
        className="ta-mywork__check"
        checked={Boolean(item.completedAt)}
        onChange={onComplete}
        aria-label={`Complete ${item.title}`}
        disabled={!canPlan || Boolean(item.completedAt)}
      />

      <div className="ta-mywork__main">
        <button className="ta-list__title" onClick={onOpen}>
          {item.title}
        </button>
        <span className="ta-mywork__meta">
          <a
            className="ta-badge ta-mywork__project"
            href={`/w/${slug}/projects/${item.projectKey}`}
            title={item.projectName}
          >
            {item.projectKey} · {item.projectName}
          </a>
          <span className="ta-mywork__due" data-late={Boolean(item.dueDate) && dueLabel(item).includes("late")}>
            {dueLabel(item)}
          </span>
          {item.statusName && <span className="ta-badge">{item.statusName}</span>}
          {item.blockedBy > 0 && (
            <span className="ta-badge ta-badge--warn" title="Waiting on another task">
              Blocked by {item.blockedBy}
            </span>
          )}
          {item.blocks > 0 && (
            <span className="ta-badge" title="Other work is waiting on this">
              Blocks {item.blocks}
            </span>
          )}
          {!mine && (
            <span className="ta-badge ta-badge--warn" title="This is no longer assigned to you">
              Not yours
            </span>
          )}
          {item.projectIsInbox && (
            <span className="ta-badge ta-badge--warn" title="Still in the workspace Inbox container">
              No real project
            </span>
          )}
          {shownLabels.map((label) => (
            <span key={label} className="ta-badge">
              {label}
            </span>
          ))}
          {hiddenLabels > 0 && (
            <span className="ta-badge" title={item.labels.slice(shownLabels.length).join(", ")}>
              +{hiddenLabels}
            </span>
          )}
        </span>
      </div>

      {canPlan && (
        <div className="ta-mywork__actions">
          {(["today", "tomorrow", "next_week"] as PlanShortcut[]).map((shortcut) => (
            <Button
              key={shortcut}
              size="sm"
              variant="secondary"
              onClick={() => onReschedule(shortcut)}
            >
              {PLAN_SHORTCUT_LABEL[shortcut]}
            </Button>
          ))}
          <input
            className="ui-input ta-mywork__date"
            type="date"
            aria-label={`Due date for ${item.title}`}
            value={item.dueDate ? item.dueDate.slice(0, 10) : ""}
            onChange={(e) =>
              onSetDue(e.target.value ? new Date(e.target.value).toISOString() : null)
            }
          />
          <Button size="sm" variant="secondary" onClick={() => onAssign(mine ? null : me)}>
            {mine ? "Unassign" : "Assign to me"}
          </Button>
          <Button size="sm" variant="secondary" onClick={onOpen}>
            Details
          </Button>
        </div>
      )}
    </div>
  );
}
