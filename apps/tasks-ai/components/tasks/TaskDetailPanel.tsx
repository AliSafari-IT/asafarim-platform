"use client";

import { useEffect, useState } from "react";
import { Button, ConfirmDialog, Input, Label, Textarea } from "@asafarim/ui";
import { api, ClientApiError, type Task } from "../../lib/client/api";
import { CommentsPanel } from "./CommentsPanel";

/**
 * Slide-over task detail. Autosaves title/description/due on blur with
 * optimistic-concurrency; a version conflict reloads rather than
 * clobbering. Delete goes through the styled ConfirmDialog (never
 * window.confirm — platform rule).
 */
export function TaskDetailPanel({
  slug,
  taskId,
  onClose,
  onChanged,
}: {
  slug: string;
  taskId: string;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [task, setTask] = useState<Task | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "conflict">("idle");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .listTasks(slug, {})
      .then((rows) => {
        if (alive) setTask(rows.find((t) => t.id === taskId) ?? null);
      })
      .catch(() => setTask(null));
    return () => {
      alive = false;
    };
  }, [slug, taskId]);

  async function save(patch: Partial<Task>) {
    if (!task) return;
    setStatus("saving");
    try {
      const updated = await api.updateTask(slug, task.id, task.version, patch as Record<string, unknown>);
      setTask(updated);
      setStatus("saved");
      await onChanged();
    } catch (err) {
      if (err instanceof ClientApiError && err.code === "conflict_version") {
        setStatus("conflict");
        const rows = await api.listTasks(slug, {});
        setTask(rows.find((t) => t.id === taskId) ?? null);
      } else {
        setStatus("idle");
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

        {!task ? (
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
