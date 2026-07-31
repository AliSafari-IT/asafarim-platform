"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Warns before leaving a page that holds unsaved form input.
 *
 * Three ways out of this page have to be covered, and they need different
 * mechanisms because the browser gives us different amounts of control over
 * each:
 *
 * 1. **Back/forward.** The case that prompted this. `popstate` fires
 *    *after* the entry has already been popped, so there is no event to
 *    cancel — the only way to stay put is to push the entry back and then
 *    ask. See `armHistoryGuard` below.
 * 2. **Reload, tab close, external navigation.** `beforeunload` is the only
 *    hook, and the browser renders its own dialog with its own wording. We
 *    cannot style it and cannot choose the text; a custom dialog is not an
 *    option here at all, so this is not a violation of the project's
 *    no-`window.confirm` rule — it is the browser protecting the user.
 * 3. **In-app links** (the Overview/Apps/New app header, "Launch
 *    readiness", "Archive"). The App Router has no navigation-guard API, so
 *    these are caught with a capture-phase click listener and routed
 *    through the same styled dialog as case 1.
 *
 * The guard is deliberately conservative: anything it is not confident it
 * should intercept, it lets through. Blocking a navigation the user
 * genuinely wanted is a worse bug than missing one — especially since
 * `clarificationDraft.ts` restores the answers either way, which is what
 * makes being conservative here safe.
 */

export interface LeaveGuardResult {
  /** True when the styled confirmation dialog should be shown. */
  promptOpen: boolean;
  /** Proceed with the navigation the user attempted. */
  confirmLeave: () => void;
  /** Stay on the page. */
  cancelLeave: () => void;
}

type PendingNavigation = { kind: "history" } | { kind: "href"; href: string };

/**
 * Whether a click on an anchor should be intercepted.
 *
 * Every `false` branch is a case where intercepting would break something
 * the user explicitly asked for — opening in a new tab, downloading a file,
 * jumping to an anchor on the same page, or leaving for another origin
 * (which `beforeunload` covers anyway, with the browser's own dialog).
 *
 * Pure and exported so the decision table is testable without a DOM.
 */
export function shouldGuardAnchorClick(click: {
  href: string | null;
  target: string | null;
  hasDownloadAttr: boolean;
  /**
   * The page's FULL current URL, not just its origin — a relative href
   * resolves against the current path, so `#section` on `/apps/abc` is
   * `/apps/abc#section` and not `/#section`. Resolving against the origin
   * instead made every same-page hash link look like a navigation away.
   */
  currentUrl: string;
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  if (click.defaultPrevented) return false;
  // Only a plain left click navigates this tab. Middle-click and
  // modifier-clicks open elsewhere and leave this page — and its form —
  // exactly where it is.
  if (click.button !== 0) return false;
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false;
  if (click.hasDownloadAttr) return false;
  if (click.target && click.target !== "" && click.target !== "_self") return false;
  if (!click.href) return false;

  let url: URL;
  let current: URL;
  try {
    current = new URL(click.currentUrl);
    url = new URL(click.href, current);
  } catch {
    return false;
  }

  // `mailto:`, `tel:`, and friends do not unload the page.
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  // Another origin: `beforeunload` handles it, and we cannot route there.
  if (url.origin !== current.origin) return false;
  // Same page, different hash — no navigation away, nothing to lose.
  if (url.pathname === current.pathname) return false;

  return true;
}

/**
 * @param active  Whether there is currently something worth protecting.
 * @param onLeave Performs the navigation once the user confirms. Receives
 *                the href for a link click, or `null` for a back/forward
 *                press (where the caller should step the history itself).
 */
export function useLeaveGuard(
  active: boolean,
  onLeave: (href: string | null) => void
): LeaveGuardResult {
  const [pending, setPending] = useState<PendingNavigation | null>(null);
  const activeRef = useRef(active);
  // Set while we are performing a confirmed navigation, so the guard does
  // not immediately re-prompt for the very move it just approved.
  const bypassRef = useRef(false);
  const guardEntryPushedRef = useRef(false);

  activeRef.current = active;

  // ── Reload / tab close / external navigation ───────────────────────────
  useEffect(() => {
    if (!active) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!activeRef.current || bypassRef.current) return;
      // Modern browsers ignore any custom string and show their own copy;
      // `preventDefault` plus a non-empty `returnValue` is what actually
      // triggers the prompt across all of them.
      event.preventDefault();
      event.returnValue = "";
      return "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);

  // ── Back / forward ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) return;

    // Push a duplicate of the current entry so the first Back press lands
    // here instead of leaving. Same URL, so nothing visible changes.
    if (!guardEntryPushedRef.current) {
      window.history.pushState({ appbuilderLeaveGuard: true }, "", window.location.href);
      guardEntryPushedRef.current = true;
    }

    function onPopState() {
      if (bypassRef.current || !activeRef.current) return;
      // The entry is already gone by the time this fires, so re-push it to
      // stay on the page, then ask.
      window.history.pushState({ appbuilderLeaveGuard: true }, "", window.location.href);
      setPending({ kind: "history" });
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [active]);

  // ── In-app links ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) return;

    function onClick(event: MouseEvent) {
      if (bypassRef.current || !activeRef.current) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;

      const guarded = shouldGuardAnchorClick({
        href: anchor.getAttribute("href"),
        target: anchor.getAttribute("target"),
        hasDownloadAttr: anchor.hasAttribute("download"),
        currentUrl: window.location.href,
        defaultPrevented: event.defaultPrevented,
        button: event.button,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      });
      if (!guarded) return;

      event.preventDefault();
      event.stopPropagation();
      setPending({ kind: "href", href: new URL(anchor.href, window.location.origin).toString() });
    }

    // Capture phase so this runs before the App Router's own link handler.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [active]);

  const confirmLeave = useCallback(() => {
    const target = pending;
    setPending(null);
    if (!target) return;

    bypassRef.current = true;
    if (target.kind === "history") {
      // Two entries back: the guard duplicate re-pushed by `onPopState`,
      // and the real one the user was trying to leave from.
      const steps = guardEntryPushedRef.current ? -2 : -1;
      guardEntryPushedRef.current = false;
      window.history.go(steps);
      onLeave(null);
      return;
    }
    onLeave(target.href);
  }, [pending, onLeave]);

  const cancelLeave = useCallback(() => setPending(null), []);

  // Once there is nothing left to protect, drop the guard entry so the
  // user's next Back press behaves normally instead of silently doing
  // nothing.
  useEffect(() => {
    if (active) return;
    bypassRef.current = false;
    guardEntryPushedRef.current = false;
  }, [active]);

  return { promptOpen: pending !== null, confirmLeave, cancelLeave };
}
