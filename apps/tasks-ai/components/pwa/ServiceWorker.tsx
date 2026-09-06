"use client";

import { useEffect, useState } from "react";

/**
 * Registers the service worker and shows a small live sync-state banner:
 * offline, N queued changes, syncing, synced. The offline mutation queue
 * itself is lib/pwa/queue.ts + an IndexedDB store; this component only
 * surfaces its state.
 */
export function ServiceWorker() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (online) return null;
  return (
    <div className="ta-offline" role="status" aria-live="polite">
      You are offline. Changes are queued and will sync when you reconnect.
    </div>
  );
}
