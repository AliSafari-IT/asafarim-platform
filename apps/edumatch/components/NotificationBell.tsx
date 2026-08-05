"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslation } from "@asafarim/shared-i18n";

type NotificationPayload = {
  title?: string;
  message?: string;
  actionUrl?: string;
};

type NotificationItem = {
  id: string;
  type: string;
  payload: NotificationPayload | null;
  readAt: string | null;
  createdAt: string;
};

const POLL_MS = 60_000;

function relativeTime(
  iso: string,
  t: (k: string, v?: Record<string, string | number>) => string,
): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return t("edumatch.notifications.justNow");
  if (min < 60) return t("edumatch.notifications.minutesAgo", { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("edumatch.notifications.hoursAgo", { n: hr });
  const day = Math.floor(hr / 24);
  return t("edumatch.notifications.daysAgo", { n: day });
}

export default function NotificationBell() {
  const { t } = useTranslation();
  const router = useRouter();
  const { status } = useSession();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=10");
      if (!res.ok) return;
      const data = (await res.json()) as {
        items: NotificationItem[];
        unreadCount: number;
      };
      setItems(data.items ?? []);
      setUnread(data.unreadCount ?? 0);
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [status, refresh]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function openItem(n: NotificationItem) {
    setOpen(false);
    if (!n.readAt) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((prev) =>
        prev.map((i) => (i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i)),
      );
      void fetch(`/api/notifications/${n.id}/mark-read`, { method: "POST" });
    }
    const url = n.payload?.actionUrl;
    if (url && url.startsWith("/")) router.push(url);
  }

  async function markAllRead() {
    setUnread(0);
    setItems((prev) => prev.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })));
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark-all-read" }),
    });
  }

  if (status !== "authenticated") return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={t("edumatch.notifications.title")}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-panel)] hover:text-[var(--color-text)] transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
            <span className="text-sm font-semibold text-[var(--color-text)]">
              {t("edumatch.notifications.title")}
            </span>
            {unread > 0 && (
              <button
                onClick={() => void markAllRead()}
                className="text-xs text-[var(--color-primary)] hover:underline"
              >
                {t("edumatch.notifications.markAllRead")}
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-[var(--color-text-muted)]">
                {t("edumatch.notifications.empty")}
              </p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => void openItem(n)}
                  className={`flex w-full flex-col items-start gap-0.5 border-b border-[var(--color-border)] px-3 py-2.5 text-left last:border-b-0 hover:bg-[var(--color-panel)] ${
                    n.readAt ? "opacity-70" : ""
                  }`}
                >
                  <div className="flex w-full items-center gap-2">
                    {!n.readAt && (
                      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--color-primary)]" />
                    )}
                    <span className="truncate text-sm font-medium text-[var(--color-text)]">
                      {n.payload?.title ?? t("edumatch.notifications.title")}
                    </span>
                    <span className="ml-auto flex-shrink-0 text-[10px] text-[var(--color-text-muted)]">
                      {relativeTime(n.createdAt, t)}
                    </span>
                  </div>
                  {n.payload?.message && (
                    <span className="line-clamp-2 text-xs text-[var(--color-text-muted)]">
                      {n.payload.message}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
