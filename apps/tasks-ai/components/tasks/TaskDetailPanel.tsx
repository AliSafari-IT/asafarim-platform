"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, ConfirmDialog, Input, Label, Select, Textarea } from "@asafarim/ui";
import { api, ClientApiError, type Task, type WorkspaceMember } from "../../lib/client/api";
import { CommentsPanel } from "./CommentsPanel";

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
 * task they can read gets the read-only drawer rather than a control whose
 * every use the server refuses.
 */
export function TaskDetailPanel({
  slug,
  taskId,
  canPlan,
  onClose,
  onChanged,
}: {
  slug: string;
  taskId: string;
  /** Whether this viewer's role may assign and reschedule work. */
  canPlan: boolean;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [task, setTask] = useState<Task | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "conflict">("idle");
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  /** Re-read the task after a conflict — again by id, not out of a list. */
  async function reload() {
    setTask(await api.getTask(slug, taskId).catch(() => null));
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
            <Label htmlFor="td-title">Title</Label>
            <Input
              id="td-title"
              defaultValue={task.title}
              key={`title-${task.version}`}
              onBlur={(e) => e.target.value.trim() && e.target.value !== task.title && save({ title: e.target.value.trim() })}
            />

            <Label htmlFor="td-desc">Description</Label>
            <Textarea
              id="td-desc"
              rows={5}
              defaultValue={task.description ?? ""}
              key={`desc-${task.version}`}
              onBlur={(e) => e.target.value !== (task.description ?? "") && save({ description: e.target.value || null })}
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
                You can read this task, but changing owners and dates needs a member role.
              </p>
            )}

            <div className="ta-drawer__actions">
              {!task.completedAt && (
                <Button
                  size="sm"
                  onClick={async () => {
                    await api.completeTask(slug, task.id);
                    await onChanged();
                    onClose();
                  }}
                >
                  Mark complete
                </Button>
              )}
              <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            </div>

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
