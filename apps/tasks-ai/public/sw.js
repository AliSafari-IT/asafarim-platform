/* TasksAI service worker (M11).
 *
 * Strategy:
 *  - App shell + static assets: cache-first, updated in the background.
 *  - GET /api/v1/*: network-first with a short-lived cache fallback so a
 *    reconnect blip still shows the last-known list (safe read caching).
 *  - Mutations (POST/PATCH/DELETE): never cached. The app's offline queue
 *    (lib/pwa/queue.ts, IndexedDB) owns replay; the SW just lets them fail
 *    fast when offline so the app can enqueue.
 */
const SHELL = "tasksai-shell-v1";
const API = "tasksai-api-v1";
const SHELL_ASSETS = ["/", "/workspace", "/favicon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL && k !== API).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.method !== "GET") return; // mutations pass straight through

  if (url.pathname.startsWith("/api/v1/")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(API).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || Response.json({ error: { code: "offline", message: "offline" } }, { status: 503 }))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) caches.open(SHELL).then((c) => c.put(request, res.clone()));
          return res;
        })
        .catch(() => hit);
      return hit || network;
    }),
  );
});
