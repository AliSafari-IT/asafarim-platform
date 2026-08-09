"use client";

import { useEffect, useMemo, useState } from "react";
import { ConfirmDialog, ButtonLink } from "@asafarim/ui";
import { apiFetch, ApiError } from "@/lib/client/api";

interface TimelineSummary {
  id: string;
  publicId: string;
  title: string;
  layout: string;
  visibility: "private" | "public" | "unlisted";
  moderationStatus: "not_required" | "pending" | "approved" | "rejected";
  editingState: "draft" | "published";
  updatedAt: string;
  version: number;
  _count: { events: number };
}

type Filter = "all" | "draft" | "private" | "published";

const appUrl = process.env.NEXT_PUBLIC_TIMELINEAI_URL || "";

function StatusBadges({ timeline }: { timeline: TimelineSummary }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="rounded-full bg-[var(--color-border,rgba(0,0,0,0.08))] px-2 py-0.5 text-xs">
        {timeline.editingState === "published" ? "Published" : "Draft"}
      </span>
      <span className="rounded-full bg-[var(--color-border,rgba(0,0,0,0.08))] px-2 py-0.5 text-xs capitalize">
        {timeline.visibility}
      </span>
      {timeline.moderationStatus === "pending" ? (
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-600">Pending review</span>
      ) : null}
      {timeline.moderationStatus === "rejected" ? (
        <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-600">Rejected</span>
      ) : null}
    </div>
  );
}

export function DashboardView() {
  const [items, setItems] = useState<TimelineSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  async function load() {
    setError(null);
    try {
      const page = await apiFetch<{ items: TimelineSummary[] }>("/api/timelines");
      setItems(page.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load your timelines. Please try again.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!items) return [];
    switch (filter) {
      case "draft":
        return items.filter((t) => t.editingState === "draft");
      case "private":
        return items.filter((t) => t.visibility === "private");
      case "published":
        return items.filter((t) => t.editingState === "published");
      default:
        return items;
    }
  }, [items, filter]);

  async function withBusy(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function handlePublishToggle(timeline: TimelineSummary) {
    await withBusy(timeline.id, async () => {
      await apiFetch(`/api/timelines/${timeline.id}/${timeline.editingState === "published" ? "unpublish" : "publish"}`, {
        method: "POST",
      });
      await load();
    });
  }

  async function handleVisibilityChange(timeline: TimelineSummary, visibility: TimelineSummary["visibility"]) {
    await withBusy(timeline.id, async () => {
      await apiFetch(`/api/timelines/${timeline.id}/visibility`, { method: "PATCH", body: { visibility } });
      await load();
    });
  }

  async function handleDuplicate(id: string) {
    await withBusy(id, async () => {
      await apiFetch(`/api/timelines/${id}/duplicate`, { method: "POST" });
      await load();
    });
  }

  async function handleDelete() {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    await withBusy(id, async () => {
      await apiFetch(`/api/timelines/${id}`, { method: "DELETE" });
      await load();
    });
  }

  async function submitRename(id: string) {
    const title = renameValue.trim();
    setRenamingId(null);
    if (!title) return;
    await withBusy(id, async () => {
      await apiFetch(`/api/timelines/${id}/rename`, { method: "PATCH", body: { title } });
      await load();
    });
  }

  if (error && !items) {
    return (
      <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-4">
        <p>{error}</p>
        <button type="button" className="mt-2 underline" onClick={load}>
          Try again
        </button>
      </div>
    );
  }

  if (!items) {
    return <p className="text-sm text-[var(--color-text-muted,inherit)]">Loading your timelines…</p>;
  }

  return (
    <div>
      {error ? (
        <div role="alert" className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
          {error}
        </div>
      ) : null}

      <div className="mb-4 flex gap-2" role="tablist" aria-label="Filter timelines">
        {(["all", "draft", "private", "published"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            className={`rounded-full px-3 py-1.5 text-sm capitalize ${filter === f ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-border,rgba(0,0,0,0.08))]"}`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border,rgba(0,0,0,0.2))] p-10 text-center">
          <p className="mb-3 text-[var(--color-text-muted,inherit)]">
            {items.length === 0 ? "You haven't created a timeline yet." : "No timelines match this filter."}
          </p>
          {items.length === 0 ? (
            <ButtonLink href="/create" variant="primary">
              Create your first timeline
            </ButtonLink>
          ) : null}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((timeline) => (
            <li
              key={timeline.id}
              className="rounded-xl border border-[var(--color-border,rgba(0,0,0,0.12))] bg-[var(--color-surface)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  {renamingId === timeline.id ? (
                    <input
                      autoFocus
                      className="rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-2 py-1 font-semibold"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => submitRename(timeline.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitRename(timeline.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="text-left font-semibold hover:underline"
                      onClick={() => {
                        setRenamingId(timeline.id);
                        setRenameValue(timeline.title);
                      }}
                      aria-label={`Rename "${timeline.title}"`}
                    >
                      {timeline.title}
                    </button>
                  )}
                  <div className="mt-1 text-xs text-[var(--color-text-muted,inherit)]">
                    {timeline._count.events} event{timeline._count.events === 1 ? "" : "s"} · Updated{" "}
                    {new Date(timeline.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </div>
                  <div className="mt-2">
                    <StatusBadges timeline={timeline} />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <a href={`/timelines/${timeline.id}/edit`} className="rounded-lg border border-[var(--color-border,currentColor)] px-3 py-1.5">
                    Open
                  </a>
                  {timeline.editingState === "published" ? (
                    <a href={`${appUrl}/t/${timeline.publicId}`} target="_blank" rel="noreferrer" className="rounded-lg border border-[var(--color-border,currentColor)] px-3 py-1.5">
                      View
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--color-border,currentColor)] px-3 py-1.5 disabled:opacity-50"
                    disabled={busyId === timeline.id}
                    onClick={() => handleDuplicate(timeline.id)}
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--color-border,currentColor)] px-3 py-1.5 disabled:opacity-50"
                    disabled={busyId === timeline.id}
                    onClick={() => handlePublishToggle(timeline)}
                  >
                    {timeline.editingState === "published" ? "Unpublish" : "Publish"}
                  </button>
                  <select
                    className="rounded-lg border border-[var(--color-border,currentColor)] bg-transparent px-2 py-1.5"
                    value={timeline.visibility}
                    disabled={busyId === timeline.id}
                    onChange={(e) => handleVisibilityChange(timeline, e.target.value as TimelineSummary["visibility"])}
                    aria-label={`Visibility for "${timeline.title}"`}
                  >
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                    <option value="unlisted">Unlisted</option>
                  </select>
                  <button
                    type="button"
                    className="rounded-lg border border-red-500/40 px-3 py-1.5 text-red-600 disabled:opacity-50"
                    disabled={busyId === timeline.id}
                    onClick={() => setConfirmDeleteId(timeline.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete this timeline?"
        message="This can't be undone — the timeline and all its events will be permanently deleted."
        tone="danger"
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
