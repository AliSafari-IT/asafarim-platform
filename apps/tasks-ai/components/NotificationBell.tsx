"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Notification } from "../lib/client/api";

/**
 * In-app notification inbox (M04 API, previously no UI). Polls every 60s,
 * shows an unread count, and marks everything read when opened.
 */
export function NotificationBell({ slug }: { slug: string }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.readAt).length;

  const load = useCallback(async () => {
    try {
      setItems(await api.listNotifications(slug));
    } catch {
      /* silent — the bell is non-critical */
    }
  }, [slug]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      const ids = items.filter((n) => !n.readAt).map((n) => n.id);
      setItems((cur) => cur.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
      await api.markNotificationsRead(slug, ids).catch(() => {});
    }
  }

  function label(n: Notification): string {
    switch (n.kind) {
      case "mention":
        return "You were mentioned";
      case "assigned":
        return "A task was assigned to you";
      case "comment":
        return "New comment on a task you watch";
      case "watched_change":
        return "A task you watch changed";
      case "invite_accepted":
        return "An invitation was accepted";
      default:
        return n.kind;
    }
  }

  return (
    <div className="ta-bell" ref={ref}>
      <button
        type="button"
        className="ta-bell__btn"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        onClick={toggle}
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && <span className="ta-bell__count">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="ta-bell__menu" role="menu">
          {items.length === 0 ? (
            <p className="ta-muted">Nothing yet.</p>
          ) : (
            <ul>
              {items.slice(0, 20).map((n) => (
                <li key={n.id} data-unread={!n.readAt}>
                  <p>{label(n)}</p>
                  <time dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleString()}</time>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
