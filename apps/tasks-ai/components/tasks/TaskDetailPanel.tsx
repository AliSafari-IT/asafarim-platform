"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, ConfirmDialog, Input, Label, Select, Textarea } from "@asafarim/ui";
import {
  api,
  ClientApiError,
  type LabelRow,
  type SearchHit,
  type StatusRow,
  type Task,
  type TaskCheck,
  type TaskRelationKind,
  type TaskRelations,
  type WorkspaceMember,
} from "../../lib/client/api";
import { TASK_INTENTS, copilotHref } from "../../lib/ai/workflow";
import { track } from "../../lib/client/telemetry";
import { useWorkspace } from "../WorkspaceShell";
import { TaskAiCost } from "./TaskAiCost";
import { CommentsPanel } from "./CommentsPanel";

const RELATION_LABEL: Record<TaskRelationKind, string> = {
  blocks: "Blocks",
  relates: "Relates to",
  duplicates: "Duplicates",
};
const CHECK_STATE_GLYPH: Record<TaskCheck["state"], string> = {
  satisfied: "✓",
  pending: "○",
  failed: "✗",
};

/**
 * Slide-over task detail. Autosaves title/description/due on blur with
 * optimistic-concurrency; a version conflict reloads rather than
 * clobbering. Delete goes through the styled ConfirmDialog (never
 * window.confirm — platform rule).
 *
 * The owner picker (issue #367) exists so the assignment My Work can change
 * from a row is also changeable here, through the same `plan` endpoint and
 * the same validation — one editing model rather than two surfaces that
 * disagree about what assigning means. It is a planning affordance, so it
 * only renders for viewers whose role may actually plan: a guest opening a
 * task they can read gets a drawer they can read and comment on rather than
 * controls whose every use the server refuses. `canPlan` gates every task
 * mutation here — title, description, owner, due date, complete, delete —
 * because all of them sit behind the same `member` boundary; commenting does
 * not, and stays available.
 */
export function TaskDetailPanel({
  slug,
  taskId,
  canPlan,
  onClose,
  onChanged,
  onOpenTask,
}: {
  slug: string;
  taskId: string;
  /** Whether this viewer's role may assign and reschedule work. */
  canPlan: boolean;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  /** Re-point this same drawer at a different task — parent/subtask navigation
   * without a full page transition, matching how the drawer already opens. */
  onOpenTask: (id: string) => void;
}) {
  const { aiEnabled } = useWorkspace();
  const [task, setTask] = useState<Task | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "conflict">("idle");
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Planning context (issue #370): parent, subtasks, dependencies, and
  // completion checks. Read for every viewer with access to the task —
  // only adding/removing them is gated on canPlan, same as everything else.
  const [parentTitle, setParentTitle] = useState<string | null>(null);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [newSubtask, setNewSubtask] = useState("");
  const [relations, setRelations] = useState<TaskRelations | null>(null);
  const [depQuery, setDepQuery] = useState("");
  const [depKind, setDepKind] = useState<TaskRelationKind>("blocks");
  const [depResults, setDepResults] = useState<SearchHit[]>([]);
  const [checks, setChecks] = useState<TaskCheck[]>([]);

  // Status + labels (issue #387). Statuses populate a picker next to the
  // other single-field task edits; labels are a checkbox-based multi-select
  // tucked into "More details" per the original #370 progressive-disclosure
  // guidance — assigning them is common but shouldn't crowd the primary panel.
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [allLabels, setAllLabels] = useState<LabelRow[]>([]);
  const [taskLabels, setTaskLabels] = useState<LabelRow[]>([]);

  // Fetch the task by id, never by finding it in a list page: every list is
  // ordered and paged for its own surface, so a row visible in My Work need
  // not be on the first generic page — the drawer would then hang on
  // "Loading…" forever.
  useEffect(() => {
    let alive = true;
    setLoadFailed(false);
    api
      .getTask(slug, taskId)
      .then((t) => {
        if (alive) setTask(t);
      })
      .catch(() => {
        if (alive) {
          setTask(null);
          setLoadFailed(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [slug, taskId]);

  useEffect(() => {
    if (!canPlan) return;
    let alive = true;
    // Members are a picker, not a list: walk the pages so everybody
    // assignable stays selectable in a large workspace.
    async function allMembers() {
      const collected: WorkspaceMember[] = [];
      const seen = new Set<string>();
      let cursorAt: string | null = null;
      for (;;) {
        const chunk: Awaited<ReturnType<typeof api.listMembers>> = await api.listMembers(slug, {
          limit: "100",
          ...(cursorAt ? { cursor: cursorAt } : {}),
        });
        collected.push(...chunk.items);
        if (!chunk.nextCursor || seen.has(chunk.nextCursor)) break;
        seen.add(chunk.nextCursor);
        cursorAt = chunk.nextCursor;
      }
      return collected;
    }
    void allMembers()
      .then((m) => {
        if (alive) setMembers(m);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [canPlan, slug]);

  useEffect(() => {
    if (!canPlan) return;
    let alive = true;
    void api
      .listStatuses(slug)
      .then((rows) => alive && setStatuses(rows))
      .catch(() => undefined);
    void api
      .listLabels(slug)
      .then((rows) => alive && setAllLabels(rows))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [canPlan, slug]);

  async function refreshSubtasks(id: string) {
    try {
      setSubtasks((await api.listSubtasks(slug, id)).items);
    } catch {
      /* non-critical section — leave the previous list rather than erroring the whole drawer */
    }
  }
  async function refreshRelations(id: string) {
    try {
      setRelations(await api.listTaskRelations(slug, id));
    } catch {
      /* see refreshSubtasks */
    }
  }
  async function refreshChecks(id: string) {
    try {
      setChecks(await api.listChecks(slug, id));
    } catch {
      /* see refreshSubtasks */
    }
  }
  async function refreshTaskLabels(id: string) {
    try {
      setTaskLabels(await api.listTaskLabels(slug, id));
    } catch {
      /* see refreshSubtasks */
    }
  }

  // Keyed on id/parentId, not on `task` itself: title/description/due-date
  // autosaves replace `task` with a new object on every save, and none of
  // that should re-fetch four extra endpoints.
  useEffect(() => {
    if (!task) return;
    let alive = true;
    void refreshSubtasks(task.id);
    void refreshRelations(task.id);
    void refreshChecks(task.id);
    void refreshTaskLabels(task.id);
    if (task.parentId) {
      api
        .getTask(slug, task.parentId)
        .then((p) => alive && setParentTitle(p.title))
        .catch(() => alive && setParentTitle(null));
    } else {
      setParentTitle(null);
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, task?.id, task?.parentId]);

  useEffect(() => {
    if (!depQuery.trim()) {
      setDepResults([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      void api
        .search(slug, depQuery.trim(), "task")
        .then((r) => alive && setDepResults((r.hits ?? []).filter((h) => h.id !== task?.id)))
        .catch(() => alive && setDepResults([]));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [slug, depQuery, task?.id]);

  async function addSubtask() {
    if (!task || !newSubtask.trim()) return;
    await api.createTask(slug, { title: newSubtask.trim(), parentId: task.id, projectId: task.projectId });
    setNewSubtask("");
    await refreshSubtasks(task.id);
    await onChanged();
  }

  async function addDependency(hit: SearchHit) {
    if (!task) return;
    try {
      await api.linkTasks(slug, task.id, { toTaskId: hit.id, kind: depKind });
      setDepQuery("");
      setDepResults([]);
      await refreshRelations(task.id);
    } catch (err) {
      report(err, "Could not link that task.");
    }
  }

  /** `fromId` is the task the relation is scoped under — the other task's id
   * for an incoming relation, since the server only lets a relation be
   * removed from the side that created it. */
  async function removeDependency(fromId: string, relationId: string) {
    if (!task) return;
    await api.unlinkTasks(slug, fromId, relationId);
    await refreshRelations(task.id);
  }

  // Guests are members of the workspace but may not own work: `planTask`
  // refuses a guest assignee. Offering one here would be a choice the server
  // is guaranteed to reject, so they never reach the picker.
  const memberOptions = useMemo(
    () => [
      { value: "", label: "Nobody" },
      ...members
        .filter((m) => m.role !== "guest")
        .map((m) => ({ value: m.id, label: m.isMe ? "Me" : m.platformUserId })),
    ],
    [members],
  );

  const statusOptions = useMemo(
    () => [
      { value: "", label: "No status" },
      ...statuses.filter((s) => !s.archivedAt).map((s) => ({ value: s.id, label: s.name })),
    ],
    [statuses],
  );

  async function toggleLabel(label: LabelRow, on: boolean) {
    if (!task) return;
    try {
      if (on) {
        await api.assignLabel(slug, task.id, label.id);
        setTaskLabels((cur) => (cur.some((l) => l.id === label.id) ? cur : [...cur, label]));
      } else {
        await api.removeLabel(slug, task.id, label.id);
        setTaskLabels((cur) => cur.filter((l) => l.id !== label.id));
      }
    } catch (err) {
      report(err, "Could not change that label.");
    }
  }

  /**
   * Re-read the task after a conflict — again by id, not out of a list. A
   * failing reload lands in the same failed state as a failing first load:
   * swallowing it would leave the drawer on "Loading…" for good, because
   * nothing else ever sets `task` again.
   */
  async function reload() {
    setLoadFailed(false);
    try {
      setTask(await api.getTask(slug, taskId));
    } catch {
      setTask(null);
      setLoadFailed(true);
      setStatus("idle");
    }
  }

  /** A failure the user did not cause silently is a failure they get told about. */
  function report(err: unknown, fallback: string) {
    setStatus("idle");
    setError(
      err instanceof ClientApiError && err.code === "forbidden"
        ? "Your role cannot change that in this workspace."
        : err instanceof Error
          ? err.message
          : fallback,
    );
  }

  /**
   * Assignment goes through the same scoped plan endpoint My Work uses, so
   * both surfaces validate the membership the same way and both lose the
   * same 409 when somebody else moved first.
   */
  async function assign(assigneeId: string | null) {
    if (!task) return;
    setStatus("saving");
    setError(null);
    try {
      setTask(await api.planTask(slug, task.id, { assigneeId }, task.version));
      setStatus("saved");
      await onChanged();
    } catch (err) {
      if (err instanceof ClientApiError && err.code === "conflict_version") {
        setStatus("conflict");
        await reload();
      } else {
        report(err, "Could not change the owner.");
      }
    }
  }

  async function save(patch: Partial<Task>) {
    if (!task) return;
    setStatus("saving");
    setError(null);
    try {
      const updated = await api.updateTask(slug, task.id, task.version, patch as Record<string, unknown>);
      setTask(updated);
      setStatus("saved");
      await onChanged();
    } catch (err) {
      if (err instanceof ClientApiError && err.code === "conflict_version") {
        setStatus("conflict");
        await reload();
      } else {
        report(err, "Could not save that change.");
      }
    }
  }

  return (
    <div className="ta-drawer" role="dialog" aria-modal="true" aria-label="Task detail">
      <div className="ta-drawer__backdrop" onClick={onClose} />
      <div className="ta-drawer__panel">
        <header>
          <span className="ta-drawer__status" aria-live="polite">
            {status === "saving" && "Saving…"}
            {status === "saved" && "Saved"}
            {status === "conflict" && "Reloaded — it changed elsewhere"}
          </span>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </header>

        {error && (
          <p className="ta-error" role="alert">
            {error}
          </p>
        )}

        {loadFailed ? (
          <p className="ta-error" role="alert">
            That task could not be loaded. It may have been deleted, or you may no longer have
            access to it.
          </p>
        ) : !task ? (
          <p className="ta-muted">Loading…</p>
        ) : (
          <>
            {task.parentId && (
              <p className="ta-drawer__parent">
                Subtask of{" "}
                {parentTitle ? (
                  <button className="ta-link" type="button" onClick={() => onOpenTask(task.parentId!)}>
                    {parentTitle}
                  </button>
                ) : (
                  <span className="ta-muted">…</span>
                )}
              </p>
            )}

            <Label htmlFor="td-title">Title</Label>
            <Input
              id="td-title"
              defaultValue={task.title}
              key={`title-${task.version}`}
              readOnly={!canPlan}
              onBlur={(e) =>
                canPlan &&
                e.target.value.trim() &&
                e.target.value !== task.title &&
                save({ title: e.target.value.trim() })
              }
            />

            <Label htmlFor="td-desc">Description</Label>
            <Textarea
              id="td-desc"
              rows={5}
              defaultValue={task.description ?? ""}
              key={`desc-${task.version}`}
              readOnly={!canPlan}
              onBlur={(e) =>
                canPlan &&
                e.target.value !== (task.description ?? "") &&
                save({ description: e.target.value || null })
              }
            />

            {canPlan && (
              <>
                <Label htmlFor="td-owner">Owner</Label>
                <Select
                  id="td-owner"
                  value={task.assigneeId ?? ""}
                  options={memberOptions}
                  onChange={(e) => void assign(e.target.value || null)}
                />

                <Label htmlFor="td-status">Status</Label>
                <Select
                  id="td-status"
                  value={task.statusId ?? ""}
                  options={statusOptions}
                  onChange={(e) => void save({ statusId: e.target.value || null })}
                />

                <Label htmlFor="td-due">Due date</Label>
                <Input
                  id="td-due"
                  type="date"
                  defaultValue={task.dueDate ? task.dueDate.slice(0, 10) : ""}
                  key={`due-${task.version}`}
                  onChange={(e) =>
                    save({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })
                  }
                />
              </>
            )}

            {!canPlan && (
              <p className="ta-hint">
                You can read this task and comment on it, but editing it, changing owners and
                dates, completing it or deleting it needs a member role.
              </p>
            )}

            {/* Hierarchy (issue #370): break vague work into concrete steps,
                and see where a task fits without leaving the drawer. */}
            <section aria-labelledby="td-subtasks">
              <h3 id="td-subtasks">Subtasks{subtasks.length > 0 ? ` (${subtasks.length})` : ""}</h3>
              {subtasks.length === 0 ? (
                <p className="ta-hint">No subtasks yet.</p>
              ) : (
                <ul className="ta-drawer__subtasks">
                  {subtasks.map((s) => (
                    <li key={s.id}>
                      <button className="ta-link" type="button" onClick={() => onOpenTask(s.id)}>
                        {s.completedAt ? "✓" : "○"} {s.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {canPlan && (
                <form
                  className="ta-drawer__inlineform"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void addSubtask();
                  }}
                >
                  <Input
                    aria-label="New subtask title"
                    placeholder="Add subtask…"
                    value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)}
                  />
                  <Button size="sm" type="submit" disabled={!newSubtask.trim()}>
                    Add
                  </Button>
                </form>
              )}
            </section>

            {/* Dependencies (issue #370): make it obvious in plain language
                why a task cannot proceed. `relates`/`duplicates` are
                secondary — only `blocks` changes whether work can start. */}
            <section aria-labelledby="td-deps">
              <h3 id="td-deps">Dependencies</h3>
              {(relations?.incoming ?? []).filter((r) => r.kind === "blocks").length === 0 &&
              (relations?.outgoing ?? []).length === 0 &&
              (relations?.incoming ?? []).filter((r) => r.kind !== "blocks").length === 0 ? (
                <p className="ta-hint">No dependencies.</p>
              ) : (
                <ul className="ta-drawer__deps">
                  {(relations?.incoming ?? [])
                    .filter((r) => r.kind === "blocks")
                    .map((r) => (
                      <li key={r.id} data-blocked={!r.task.completedAt}>
                        <span className="ta-badge" data-h={r.task.completedAt ? "on_track" : "at_risk"}>
                          Blocked by
                        </span>{" "}
                        <button className="ta-link" type="button" onClick={() => onOpenTask(r.task.id)}>
                          {r.task.title}
                        </button>
                        {canPlan && (
                          <Button size="sm" variant="secondary" onClick={() => void removeDependency(r.task.id, r.id)}>
                            Remove
                          </Button>
                        )}
                      </li>
                    ))}
                  {(relations?.outgoing ?? []).map((r) => (
                    <li key={r.id}>
                      <span className="ta-badge">{RELATION_LABEL[r.kind]}</span>{" "}
                      <button className="ta-link" type="button" onClick={() => onOpenTask(r.task.id)}>
                        {r.task.title}
                      </button>
                      {canPlan && (
                        <Button size="sm" variant="secondary" onClick={() => void removeDependency(task.id, r.id)}>
                          Remove
                        </Button>
                      )}
                    </li>
                  ))}
                  {(relations?.incoming ?? [])
                    .filter((r) => r.kind !== "blocks")
                    .map((r) => (
                      <li key={r.id}>
                        <span className="ta-badge">{RELATION_LABEL[r.kind]} (of this)</span>{" "}
                        <button className="ta-link" type="button" onClick={() => onOpenTask(r.task.id)}>
                          {r.task.title}
                        </button>
                      </li>
                    ))}
                </ul>
              )}
              {canPlan && (
                <div className="ta-drawer__deppicker">
                  <Select
                    aria-label="Dependency kind"
                    value={depKind}
                    options={[
                      { value: "blocks", label: "Blocks" },
                      { value: "relates", label: "Relates to" },
                      { value: "duplicates", label: "Duplicates" },
                    ]}
                    onChange={(e) => setDepKind(e.target.value as TaskRelationKind)}
                  />
                  <Input
                    aria-label="Search tasks to link"
                    placeholder="Search a task to link…"
                    value={depQuery}
                    onChange={(e) => setDepQuery(e.target.value)}
                  />
                  {depResults.length > 0 && (
                    <ul className="ta-drawer__depresults">
                      {depResults.map((h) => (
                        <li key={h.id}>
                          <button className="ta-link" type="button" onClick={() => void addDependency(h)}>
                            {h.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>

            {/* Labels (issue #387, per original #370 spec): tucked behind a
                native <details> disclosure so tagging doesn't crowd the
                primary panel — it's read here by every viewer with access,
                same as checks below, but only canPlan viewers get the
                checkboxes to change it. */}
            <details className="ta-drawer__more">
              <summary>More details{taskLabels.length > 0 ? ` (${taskLabels.length} label${taskLabels.length > 1 ? "s" : ""})` : ""}</summary>
              <section aria-labelledby="td-labels">
                <h3 id="td-labels">Labels</h3>
                {!canPlan ? (
                  taskLabels.length === 0 ? (
                    <p className="ta-hint">No labels.</p>
                  ) : (
                    <ul className="ta-drawer__labels">
                      {taskLabels.map((l) => (
                        <li key={l.id}>
                          <span className="ta-badge" style={{ backgroundColor: l.color }}>
                            {l.name}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )
                ) : allLabels.length === 0 ? (
                  <p className="ta-hint">
                    No labels exist yet in this workspace. Create one from workspace settings.
                  </p>
                ) : (
                  <ul className="ta-drawer__labelpicker">
                    {allLabels
                      .filter((l) => !l.archivedAt)
                      .map((l) => {
                        const checked = taskLabels.some((tl) => tl.id === l.id);
                        return (
                          <li key={l.id}>
                            <label>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => void toggleLabel(l, e.target.checked)}
                              />
                              <span className="ta-badge" style={{ backgroundColor: l.color }}>
                                {l.name}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </section>
            </details>

            {/*
              Editing, completing and deleting are all the `member` boundary
              (`task.update` / `task.delete`), the same one `canPlan` carries,
              so a guest gets none of them rather than buttons the server is
              certain to refuse. Comments stay below: those run a separate
              service path that viewers with read access are allowed.
            */}
            {/* Completion checks (issue #370): the green-light gate
                task.complete() enforces server-side. Shown for every viewer
                with read access — knowing why a task can't finish yet isn't
                a planning action. */}
            {checks.length > 0 && (
              <section aria-labelledby="td-checks">
                <h3 id="td-checks">Completion checks</h3>
                <ul className="ta-drawer__checks">
                  {checks.map((c) => (
                    <li key={c.id} data-state={c.state}>
                      <span aria-hidden>{CHECK_STATE_GLYPH[c.state]}</span> {c.source}: {c.key}
                      {c.state === "failed" && c.reason && <span className="ta-hint"> — {c.reason}</span>}
                      {c.evidenceUrl && (
                        <a className="ta-link" href={c.evidenceUrl} target="_blank" rel="noreferrer">
                          Evidence
                        </a>
                      )}
                      {c.overriddenAt && <span className="ta-hint"> (overridden)</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {canPlan && (
              <div className="ta-drawer__actions">
                {!task.completedAt && (
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await api.completeTask(slug, task.id);
                        await onChanged();
                        onClose();
                      } catch (err) {
                        if (err instanceof ClientApiError && err.code === "blocked_by_check") {
                          const blocking = (err.details as { checks?: TaskCheck[] } | undefined)?.checks ?? [];
                          setError(
                            blocking.length > 0
                              ? `Blocked by ${blocking.length} unfinished check${blocking.length > 1 ? "s" : ""}: ${blocking
                                  .map((c) => `${c.source}: ${c.key}`)
                                  .join(", ")}.`
                              : "This task has unfinished completion checks.",
                          );
                          await refreshChecks(task.id);
                        } else {
                          report(err, "Could not complete that task.");
                        }
                      }
                    }}
                  >
                    Mark complete
                  </Button>
                )}
                <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              </div>
            )}

            {/*
              Contextual AI actions (issue #368). They are links into the
              same guided proposal workflow, seeded with this task — never a
              second, quieter mutation path. Nothing here changes the task;
              the copilot page still generates a proposal the human has to
              approve. Gated on `canPlan` because applying one creates work,
              and on the workspace kill-switch so an AI-disabled workspace
              shows no AI affordance at all.
            */}
            {canPlan && aiEnabled && (
              <section className="ta-drawer__ai" aria-labelledby="td-ai">
                <h3 id="td-ai">Ask Copilot</h3>
                <p className="ta-hint">
                  Copilot drafts a proposal about this task. You review it and decide — nothing is
                  changed here until you approve it.
                </p>
                <ul className="ta-drawer__ailist">
                  {TASK_INTENTS.map((intent) => (
                    <li key={intent.id}>
                      <a
                        className="ta-link"
                        href={copilotHref(slug, {
                          intent: intent.id,
                          taskId: task.id,
                          from: "task_detail",
                        })}
                        onClick={() =>
                          track({ name: "copilot.opened", from: "task_detail", intent: intent.id })
                        }
                      >
                        {intent.entryLabel}
                      </a>
                      <span className="ta-hint">{intent.outcome}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {aiEnabled && <TaskAiCost slug={slug} taskId={task.id} />}

            <CommentsPanel slug={slug} taskId={task.id} />
          </>
        )}
      </div>

      {task && (
        <ConfirmDialog
          open={confirmDelete}
          tone="danger"
          title="Delete this task?"
          message="It will be archived. Subtasks are detached, not deleted."
          confirmLabel="Delete"
          onConfirm={async () => {
            await api.deleteTask(slug, task.id, task.version);
            setConfirmDelete(false);
            await onChanged();
            onClose();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
