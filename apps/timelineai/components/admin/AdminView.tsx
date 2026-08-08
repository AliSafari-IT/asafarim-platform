"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog } from "@asafarim/ui";
import { apiFetch, ApiError } from "@/lib/client/api";

interface AdminTimelineRow {
  id: string;
  publicId: string;
  title: string;
  ownerUserId: string | null;
  guestIdHash: string | null;
  owner: { id: string; name: string | null; email: string } | null;
  visibility: "private" | "public" | "unlisted";
  moderationStatus: "not_required" | "pending" | "approved" | "rejected";
  editingState: "draft" | "published";
  moderationReason: string | null;
  createdAt: string;
  submittedAt: string | null;
  updatedAt: string;
  _count: { events: number };
}

interface Filters {
  ownership: "" | "guest" | "authenticated";
  moderationStatus: "" | "not_required" | "pending" | "approved" | "rejected";
  visibility: "" | "private" | "public" | "unlisted";
  search: string;
}

const appUrl = process.env.NEXT_PUBLIC_TIMELINEAI_URL || "";

function ownerLabel(row: AdminTimelineRow): string {
  if (row.owner) return row.owner.name || row.owner.email;
  if (row.guestIdHash) return `Guest (${row.guestIdHash.slice(0, 8)}…)`; // masked, never the raw IP
  return "Unknown";
}

export function AdminView() {
  const [items, setItems] = useState<AdminTimelineRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    ownership: "",
    moderationStatus: "",
    visibility: "",
    search: "",
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.ownership) params.set("ownership", filters.ownership);
      if (filters.moderationStatus) params.set("moderationStatus", filters.moderationStatus);
      if (filters.visibility) params.set("visibility", filters.visibility);
      if (filters.search) params.set("search", filters.search);
      const page = await apiFetch<{ items: AdminTimelineRow[] }>(`/api/admin/timelines?${params}`);
      setItems(page.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load submissions. Please try again.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.ownership, filters.moderationStatus, filters.visibility]);

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

  async function handleApprove(id: string) {
    await withBusy(id, async () => {
      await apiFetch(`/api/admin/timelines/${id}/approve`, { method: "POST" });
      await load();
    });
  }

  async function submitReject(id: string) {
    const reason = rejectReason.trim() || null;
    setRejectingId(null);
    setRejectReason("");
    await withBusy(id, async () => {
      await apiFetch(`/api/admin/timelines/${id}/reject`, { method: "POST", body: { reason } });
      await load();
    });
  }

  async function handleDelete() {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    await withBusy(id, async () => {
      await apiFetch(`/api/admin/timelines/${id}`, { method: "DELETE", body: { reason: null } });
      await load();
    });
  }

  return (
    <div>
      <form
        className="mb-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span>Search title or share id</span>
          <input
            className="rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-3 py-1.5"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Ownership</span>
          <select
            className="rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-2 py-1.5"
            value={filters.ownership}
            onChange={(e) => setFilters((f) => ({ ...f, ownership: e.target.value as Filters["ownership"] }))}
          >
            <option value="">All</option>
            <option value="guest">Guest</option>
            <option value="authenticated">Authenticated</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Moderation</span>
          <select
            className="rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-2 py-1.5"
            value={filters.moderationStatus}
            onChange={(e) => setFilters((f) => ({ ...f, moderationStatus: e.target.value as Filters["moderationStatus"] }))}
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="not_required">Not required</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Visibility</span>
          <select
            className="rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-2 py-1.5"
            value={filters.visibility}
            onChange={(e) => setFilters((f) => ({ ...f, visibility: e.target.value as Filters["visibility"] }))}
          >
            <option value="">All</option>
            <option value="private">Private</option>
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
          </select>
        </label>
        <button type="submit" className="rounded-lg border border-[var(--color-border,currentColor)] px-3 py-1.5 text-sm">
          Search
        </button>
      </form>

      {error ? (
        <div role="alert" className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
          {error}
        </div>
      ) : null}

      {!items ? (
        <p className="text-sm text-[var(--color-text-muted,inherit)]">Loading submissions…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--color-border,rgba(0,0,0,0.2))] p-10 text-center text-[var(--color-text-muted,inherit)]">
          No timelines match these filters.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((row) => (
            <li key={row.id} className="rounded-xl border border-[var(--color-border,rgba(0,0,0,0.12))] bg-[var(--color-surface)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{row.title}</div>
                  <div className="mt-0.5 text-xs text-[var(--color-text-muted,inherit)]">
                    {ownerLabel(row)} · {row._count.events} events · Updated{" "}
                    {new Date(row.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    {row.submittedAt
                      ? ` · Submitted ${new Date(row.submittedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                      : ""}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-[var(--color-border,rgba(0,0,0,0.08))] px-2 py-0.5 text-xs capitalize">
                      {row.editingState}
                    </span>
                    <span className="rounded-full bg-[var(--color-border,rgba(0,0,0,0.08))] px-2 py-0.5 text-xs capitalize">
                      {row.visibility}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs capitalize ${
                        row.moderationStatus === "pending"
                          ? "bg-amber-500/15 text-amber-600"
                          : row.moderationStatus === "rejected"
                            ? "bg-red-500/15 text-red-600"
                            : row.moderationStatus === "approved"
                              ? "bg-emerald-500/15 text-emerald-600"
                              : "bg-[var(--color-border,rgba(0,0,0,0.08))]"
                      }`}
                    >
                      {row.moderationStatus.replace("_", " ")}
                    </span>
                  </div>
                  {row.moderationReason ? (
                    <p className="mt-1 text-xs text-[var(--color-text-muted,inherit)]">Reason: {row.moderationReason}</p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <a
                    href={`${appUrl}/t/${row.publicId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-[var(--color-border,currentColor)] px-3 py-1.5"
                  >
                    Preview
                  </a>
                  <a href={`/timelines/${row.id}/edit`} className="rounded-lg border border-[var(--color-border,currentColor)] px-3 py-1.5">
                    Edit
                  </a>
                  {row.moderationStatus === "pending" ? (
                    <>
                      <button
                        type="button"
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-white disabled:opacity-50"
                        disabled={busyId === row.id}
                        onClick={() => handleApprove(row.id)}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-red-500/40 px-3 py-1.5 text-red-600 disabled:opacity-50"
                        disabled={busyId === row.id}
                        onClick={() => {
                          setRejectingId(row.id);
                          setRejectReason("");
                        }}
                      >
                        Reject
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-lg border border-red-500/40 px-3 py-1.5 text-red-600 disabled:opacity-50"
                    disabled={busyId === row.id}
                    onClick={() => setConfirmDeleteId(row.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {rejectingId === row.id ? (
                <div className="mt-3 flex flex-col gap-2 rounded-lg border border-[var(--color-border,rgba(0,0,0,0.12))] p-3">
                  <label className="text-sm font-medium" htmlFor={`reject-reason-${row.id}`}>
                    Reason for rejection (optional, shown to help track decisions)
                  </label>
                  <textarea
                    id={`reject-reason-${row.id}`}
                    className="rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-2 py-1.5 text-sm"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white"
                      onClick={() => submitReject(row.id)}
                    >
                      Confirm rejection
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-[var(--color-border,currentColor)] px-3 py-1.5 text-sm"
                      onClick={() => setRejectingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete this timeline?"
        message="This permanently deletes the timeline and all its events. The deletion itself is recorded in the platform audit log."
        tone="danger"
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
