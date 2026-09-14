"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, EmptyState, Select } from "@asafarim/ui";
import {
  api,
  ClientApiError,
  type InboxItem,
  type Project,
  type WorkspaceMember,
} from "../../lib/client/api";
import { SOURCE_LABEL, whatIsMissing, type CaptureSource } from "../../lib/capture/inbox";
import { measureView, track } from "../../lib/client/telemetry";
import { useCapture } from "../capture/CaptureDialog";
import { TaskDetailPanel } from "./TaskDetailPanel";

/**
 * Inbox triage (issue #366).
 *
 * The Inbox is captured work that still needs organizing — never "all open
 * tasks". Each row supports the whole decision in place (project, owner,
 * date, done/dismiss) so triage is a pass down a list, not a trip through a
 * task-detail form per item. Keyboard-first, because TasksAI is:
 *
 *   j / ↓   next item          p  jump to the project picker
 *   k / ↑   previous item      o  jump to the owner picker
 *   Enter   open full details  d  jump to the due date
 *   t       organize (leaves the Inbox)
 *   c       complete           x  dismiss
 */
const KEY_HINTS = "j/k move · t organize · a assign to me · d due date · c complete · x dismiss · Enter details";

export function InboxTriage({ slug, me, role }: { slug: string; me: string; role: string }) {
  const capture = useCapture();
  const canTriage = role !== "guest";
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const done = measureView("inbox");
    try {
      const rows = await api.listInbox(slug);
      setItems(rows);
      setCursor((c) => Math.min(c, Math.max(rows.length - 1, 0)));
      setError(null);
      track({ name: "inbox.viewed", items: rows.length });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the Inbox.");
    } finally {
      done();
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canTriage) return;
    let alive = true;
    void Promise.all([api.listProjects(slug), api.listMembers(slug)])
      .then(([p, m]) => {
        if (!alive) return;
        setProjects(p.filter((x) => !x.isInbox && !x.archivedAt));
        setMembers(m);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [slug, canTriage]);

  const act = useCallback(
    async (item: InboxItem, body: Record<string, unknown>, action: string) => {
      setBusyId(item.id);
      // Optimistic: a triaged item leaves the Inbox immediately. Anything
      // that still needs triage (a partial edit) stays.
      const leaves = body.triaged !== false;
      if (leaves) setItems((cur) => cur?.filter((t) => t.id !== item.id) ?? cur);
      try {
        await api.triageTask(slug, item.id, body);
        track({ name: "inbox.triaged", action });
        if (!leaves) await load();
      } catch (err) {
        setError(
          err instanceof ClientApiError && err.code === "forbidden"
            ? "Your role cannot organize work in this workspace."
            : err instanceof Error
              ? err.message
              : "Could not update that item.",
        );
        await load();
      } finally {
        setBusyId(null);
      }
    },
    [load, slug],
  );

  const complete = useCallback(
    async (item: InboxItem) => {
      setItems((cur) => cur?.filter((t) => t.id !== item.id) ?? cur);
      try {
        await api.completeTask(slug, item.id);
        track({ name: "inbox.triaged", action: "complete" });
        track({ name: "task.completed" });
      } catch {
        await load();
      }
    },
    [load, slug],
  );

  const dismiss = useCallback(
    async (item: InboxItem) => {
      setItems((cur) => cur?.filter((t) => t.id !== item.id) ?? cur);
      try {
        await api.deleteTask(slug, item.id, item.version);
        track({ name: "inbox.triaged", action: "dismiss" });
      } catch {
        await load();
      }
    },
    [load, slug],
  );

  // Global keys. Typing in a field always wins — nothing here hijacks input.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        selected ||
        !items ||
        items.length === 0 ||
        (target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable))
      ) {
        return;
      }
      const item = items[Math.min(cursor, items.length - 1)];
      if (!item) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, items.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        setSelected(item.id);
      } else if (!canTriage) {
        return;
      } else if (e.key === "t") {
        e.preventDefault();
        void act(item, { triaged: true }, "organize");
      } else if (e.key === "a") {
        e.preventDefault();
        void act(item, { assigneeId: me, triaged: true }, "assign_to_me");
      } else if (e.key === "c") {
        e.preventDefault();
        void complete(item);
      } else if (e.key === "x") {
        e.preventDefault();
        void dismiss(item);
      } else if (e.key === "p" || e.key === "o" || e.key === "d") {
        const field = e.key === "p" ? "project" : e.key === "o" ? "owner" : "due";
        const el = document.getElementById(`triage-${field}-${item.id}`);
        if (el) {
          e.preventDefault();
          el.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, canTriage, complete, cursor, dismiss, items, me, selected]);

  const projectOptions = useMemo(
    () => [
      { value: "", label: "No project yet" },
      ...projects.map((p) => ({ value: p.id, label: `${p.key} · ${p.name}` })),
    ],
    [projects],
  );
  const memberOptions = useMemo(
    () => [
      { value: "", label: "Nobody yet" },
      ...members.map((m) => ({
        value: m.id,
        label: m.isMe ? "Me" : m.platformUserId,
      })),
    ],
    [members],
  );

  return (
    <section className="ta-tw">
      <header className="ta-tw__head">
        <h1>Inbox</h1>
        <span className="ta-tw__headactions">
          <Button size="sm" onClick={() => capture.open("", "inbox")}>
            Capture task
          </Button>
          <a className="ta-link" href={`/w/${slug}/copilot`}>
            Open Copilot
          </a>
        </span>
      </header>
      <p className="ta-hint">
        Captured work waiting to be organized. Give an item a project, an owner, or a date and
        it leaves the Inbox and shows up in normal planning — My Work lists what is assigned to
        you.
      </p>

      {error && (
        <p className="ta-error" role="alert">
          {error}
        </p>
      )}

      {items === null ? (
        <p className="ta-muted">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="Your Inbox is clear"
          description="Inbox is where newly captured work waits for review. Capture a task now, or paste meeting notes into Copilot and apply what it drafts."
          action={
            <span className="ta-tw__headactions">
              <Button size="sm" onClick={() => capture.open("", "inbox_empty")}>
                Capture task
              </Button>
              <a className="ta-link" href={`/w/${slug}/copilot`}>
                Open Copilot
              </a>
            </span>
          }
        />
      ) : (
        <>
          <p className="ta-hint ta-inbox__keys">{KEY_HINTS}</p>
          <ul className="ta-inbox">
            {items.map((item, i) => {
              const missing = whatIsMissing(item);
              return (
                <li
                  key={item.id}
                  className="ta-inbox__row"
                  data-active={i === cursor}
                  aria-busy={busyId === item.id}
                  onMouseEnter={() => setCursor(i)}
                >
                  <div className="ta-inbox__main">
                    <button className="ta-list__title" onClick={() => setSelected(item.id)}>
                      {item.title}
                    </button>
                    <span className="ta-inbox__meta">
                      <span className="ta-badge" title="Where this came from">
                        {SOURCE_LABEL[item.source as CaptureSource] ?? item.source}
                      </span>
                      {missing.length > 0 ? (
                        <span className="ta-inbox__missing">Still needs: {missing.join(", ")}</span>
                      ) : (
                        <span className="ta-inbox__missing">Ready — press t to organize</span>
                      )}
                    </span>
                  </div>

                  {canTriage && (
                    <div className="ta-inbox__actions">
                      <Select
                        id={`triage-project-${item.id}`}
                        aria-label={`Project for ${item.title}`}
                        value={item.projectIsInbox ? "" : item.projectId}
                        options={projectOptions}
                        onChange={(e) =>
                          e.target.value &&
                          void act(item, { projectId: e.target.value, triaged: false }, "project")
                        }
                      />
                      <Select
                        id={`triage-owner-${item.id}`}
                        aria-label={`Owner for ${item.title}`}
                        value={item.assigneeId ?? ""}
                        options={memberOptions}
                        onChange={(e) =>
                          void act(
                            item,
                            { assigneeId: e.target.value || null, triaged: false },
                            "assign",
                          )
                        }
                      />
                      <input
                        id={`triage-due-${item.id}`}
                        className="ui-input ta-inbox__due"
                        type="date"
                        aria-label={`Due date for ${item.title}`}
                        value={item.dueDate ? item.dueDate.slice(0, 10) : ""}
                        onChange={(e) =>
                          void act(
                            item,
                            {
                              dueDate: e.target.value
                                ? new Date(e.target.value).toISOString()
                                : null,
                              triaged: false,
                            },
                            "due_date",
                          )
                        }
                      />
                      <Button size="sm" onClick={() => void act(item, { triaged: true }, "organize")}>
                        Organize
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void act(item, { assigneeId: me, triaged: true }, "assign_to_me")}
                      >
                        Assign to me
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => void complete(item)}>
                        Complete
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => void dismiss(item)}>
                        Dismiss
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {!canTriage && (
            <p className="ta-hint">
              You can read the Inbox, but organizing work needs a member role.
            </p>
          )}
        </>
      )}

      {selected && (
        <TaskDetailPanel
          slug={slug}
          taskId={selected}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </section>
  );
}
