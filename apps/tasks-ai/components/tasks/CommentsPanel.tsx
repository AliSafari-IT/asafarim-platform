"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Textarea } from "@asafarim/ui";
import { api, type Comment } from "../../lib/client/api";

/**
 * Comments tab for the task detail panel (M04 API, previously no UI).
 * Plain-text composer; @mentions are a later enhancement (the API accepts
 * `@[Name](membershipId)` tokens once a picker exists).
 */
export function CommentsPanel({ slug, taskId }: { slug: string; taskId: string }) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setComments(await api.listComments(slug, taskId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load comments.");
    }
  }, [slug, taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    try {
      const created = await api.addComment(slug, taskId, body);
      setComments((c) => [...(c ?? []), created]);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post the comment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ta-comments">
      <h4>Comments</h4>
      {error && <p className="ta-error" role="alert">{error}</p>}
      {comments === null ? (
        <p className="ta-muted">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="ta-muted">No comments yet.</p>
      ) : (
        <ul>
          {comments.map((c) => (
            <li key={c.id}>
              <p className="ta-comments__meta">
                <code>{c.authorId.slice(-6)}</code> · {new Date(c.createdAt).toLocaleString()}
                {c.editedAt && " · edited"}
              </p>
              <p className="ta-comments__body">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="ta-comments__composer">
        <Textarea
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a comment…"
          aria-label="New comment"
        />
        <Button type="submit" size="sm" disabled={busy || !draft.trim()}>
          {busy ? "Posting…" : "Comment"}
        </Button>
      </form>
    </div>
  );
}
