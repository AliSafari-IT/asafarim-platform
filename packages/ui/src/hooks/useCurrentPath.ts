"use client";

import { useSyncExternalStore } from "react";

/**
 * The current URL pathname, kept up to date across client-side navigation —
 * without depending on a framework router, so @asafarim/ui stays framework-
 * free. App Router navigations go through history.pushState/replaceState,
 * which fire no event of their own; the first subscriber wraps both (once,
 * idempotently) to dispatch one, and back/forward is covered by popstate.
 *
 * Returns null during server rendering and hydration, so markup that depends
 * on it (e.g. the active nav item) is filled in right after hydration
 * instead of causing a hydration mismatch.
 */

const EVENT = "asafarim:locationchange";
let patched = false;

function patchHistory() {
  if (patched || typeof window === "undefined") return;
  patched = true;
  for (const method of ["pushState", "replaceState"] as const) {
    const original = window.history[method];
    window.history[method] = function patchedHistoryMethod(this: History, ...args) {
      const result = original.apply(this, args as Parameters<History["pushState"]>);
      // Deferred, not synchronous: Next's App Router calls pushState/
      // replaceState from inside a useInsertionEffect, where scheduling a
      // React update throws ("useInsertionEffect must not schedule
      // updates"). A microtask runs right after that commit finishes.
      queueMicrotask(() => window.dispatchEvent(new Event(EVENT)));
      return result;
    };
  }
}

function subscribe(onChange: () => void) {
  patchHistory();
  window.addEventListener(EVENT, onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("popstate", onChange);
  };
}

export function useCurrentPath(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    () => null,
  );
}

/**
 * Which of `hrefs` names the current page: the longest same-origin href
 * that equals the path or is a parent segment of it. "/" only matches the
 * root exactly, so an "Overview" link doesn't light up on every page, and
 * "/tailor/history" wins over "/tailor" on the history page.
 */
export function activeHref(
  hrefs: readonly string[],
  pathname: string | null,
  origin: string | undefined = typeof window === "undefined" ? undefined : window.location.origin,
): string | null {
  if (!pathname || !origin) return null;
  const normalize = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
  const current = normalize(pathname);
  let best: string | null = null;
  let bestLength = -1;
  for (const href of hrefs) {
    let path: string;
    try {
      const url: URL = new URL(href, origin);
      if (url.origin !== origin) continue;
      path = normalize(url.pathname);
    } catch {
      continue;
    }
    const matches = path === "/" ? current === "/" : current === path || current.startsWith(`${path}/`);
    if (matches && path.length > bestLength) {
      best = href;
      bestLength = path.length;
    }
  }
  return best;
}
