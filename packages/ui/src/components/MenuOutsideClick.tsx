"use client";

import { useEffect } from "react";

/**
 * Closes any open header dropdown (<details name="ui-header-menu">) when the
 * user clicks outside of it. The native <details> element only closes when its
 * own <summary> is toggled — it has no built-in "click outside to dismiss"
 * behavior. This component installs a single document-level listener and is
 * rendered once by <AppShell>; it renders nothing itself.
 */
export function MenuOutsideClick() {
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Element | null;
      // Click inside a menu — let <details> handle it natively.
      if (target?.closest?.("details.ui-menu")) return;
      // Click outside — close every open header menu.
      document
        .querySelectorAll('details.ui-menu[open][name="ui-header-menu"]')
        .forEach((el) => {
          (el as HTMLDetailsElement).open = false;
        });
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return null;
}
